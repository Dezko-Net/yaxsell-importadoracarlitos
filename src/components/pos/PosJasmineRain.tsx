'use client';

import React, { useEffect, useState } from 'react';
import styles from './pos-jasmine-rain.module.css';

interface JasmineDropSpec {
  id: number;
  left: string;
  size: number;
  fallDuration: string;
  fallDelay: string;
  swayDuration: string;
  spinDuration: string;
  swayAmp: string;
  windDrift: string;
  rotStart: string;
  rotEnd: string;
  peakOpacity: number;
  kind: 'lamp' | 'gem' | 'jasmine' | 'moon';
}

const JASMINE_DROPS: JasmineDropSpec[] = Array.from({ length: 36 }, (_, idx) => {
  const lane = (idx * 2.8 + (idx % 4) * 1.6) % 98;
  const kinds: Array<'lamp' | 'gem' | 'jasmine' | 'moon'> = ['lamp', 'gem', 'jasmine', 'moon'];
  const kind = kinds[idx % kinds.length];
  const size =
    kind === 'lamp'
      ? 26 + (idx % 3) * 4
      : kind === 'gem'
      ? 22 + (idx % 3) * 3
      : kind === 'jasmine'
      ? 23 + (idx % 3) * 3
      : 21 + (idx % 3) * 3;
  const fallSeconds = 3.5 + (idx % 6) * 0.35;
  const delaySeconds = (idx % 12) * 0.11 + Math.floor(idx / 12) * 0.22;
  const swaySeconds = 1.65 + (idx % 5) * 0.24;
  const spinSeconds = 2.4 + (idx % 4) * 0.36;
  const swayAmpPx = 18 + (idx % 5) * 6;
  const windDriftPx = (idx % 2 === 0 ? 1 : -1) * (20 + (idx % 4) * 11);
  const rotStartDeg = (idx % 2 === 0 ? -1 : 1) * (15 + (idx % 4) * 8);
  const rotEndDeg = rotStartDeg + (idx % 2 === 0 ? 42 : -42);

  return {
    id: idx + 1,
    left: `${lane.toFixed(1)}%`,
    size,
    fallDuration: `${fallSeconds.toFixed(2)}s`,
    fallDelay: `${delaySeconds.toFixed(2)}s`,
    swayDuration: `${swaySeconds.toFixed(2)}s`,
    spinDuration: `${spinSeconds.toFixed(2)}s`,
    swayAmp: `${swayAmpPx}px`,
    windDrift: `${windDriftPx}px`,
    rotStart: `${rotStartDeg}deg`,
    rotEnd: `${rotEndDeg}deg`,
    peakOpacity: 0.92 + (idx % 3) * 0.03,
    kind,
  };
});

function RainMagicLamp({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 38 28" className={styles.dropVisualSvg} aria-hidden="true">
      <defs>
        <linearGradient id={`r-lamp-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="48%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      {/* Lamp pedestal */}
      <ellipse cx="18" cy="23.5" rx="6" ry="2" fill="#a16207" stroke="#713f12" strokeWidth="0.9" />
      <path d="M14.5 19.5 L21.5 19.5 L22.8 23 L13.2 23 Z" fill={`url(#r-lamp-${id})`} stroke="#713f12" strokeWidth="0.9" />
      {/* Lamp body + spout */}
      <path
        d="M7.5 14 C7.5 10.8 12.2 9.5 18 9.5 C23.2 9.5 26.5 11.4 30.5 9 C32.8 7.6 34.8 7.2 36.2 8 C34.4 10.2 31.4 13 27.8 15 C24.6 16.8 21.6 19.5 18 19.5 C12.8 19.5 7.5 17 7.5 14 Z"
        fill={`url(#r-lamp-${id})`}
        stroke="#713f12"
        strokeWidth="1.1"
      />
      {/* Ornate handle */}
      <path
        d="M9.5 12 C4.5 10.2 3.2 15.8 7.4 17.5 C9.4 18.2 10.6 16.8 10.2 15.2"
        fill="none"
        stroke="#fef08a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Dome lid + finial */}
      <path d="M14.5 9.5 C14.5 6.4 21.5 6.4 21.5 9.5 Z" fill="#fef08a" stroke="#713f12" strokeWidth="0.9" />
      <circle cx="18" cy="5.5" r="1.5" fill="#fde047" stroke="#713f12" strokeWidth="0.7" />
      {/* Royal turquoise jewel */}
      <ellipse cx="18" cy="14.5" rx="2.2" ry="2.8" fill="#14b8a6" stroke="#fef9c3" strokeWidth="0.8" />
      <ellipse cx="17.3" cy="13.6" rx="0.7" ry="1" fill="#ffffff" fillOpacity="0.85" />
    </svg>
  );
}

function RainTiaraGem({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 32 34" className={styles.dropVisualSvg} aria-hidden="true">
      <defs>
        <linearGradient id={`r-gem-${id}`} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#99f6e4" />
          <stop offset="45%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      {/* Gold tiara frame */}
      <ellipse cx="16" cy="18" rx="10.2" ry="12.2" fill="#facc15" stroke="#854d0e" strokeWidth="1.2" />
      {/* Top golden plume */}
      <path d="M16 2.2 C18.2 5.4 18.2 7 16 8.5 C13.8 7 13.8 5.4 16 2.2 Z" fill="#fef08a" stroke="#854d0e" strokeWidth="0.9" />
      {/* Inner sapphire-turquoise cabochon */}
      <ellipse cx="16" cy="18" rx="7.4" ry="9.4" fill={`url(#r-gem-${id})`} stroke="#fef9c3" strokeWidth="0.9" />
      {/* Specular shine */}
      <ellipse cx="13.5" cy="13.8" rx="2.1" ry="3.5" transform="rotate(-18 13.5 13.8)" fill="#ffffff" fillOpacity="0.8" />
      <circle cx="18.6" cy="22.4" r="1.1" fill="#ccfbf1" fillOpacity="0.75" />
    </svg>
  );
}

function RainJasmineBlossom({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 32 32" className={styles.dropVisualSvg} aria-hidden="true">
      <defs>
        <radialGradient id={`r-jas-${id}`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="35%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ccfbf1" />
        </radialGradient>
      </defs>
      {/* Emerald leaves behind blossom */}
      <path d="M5 24 C8 19 12 19 14 22 C11 25 8 26 5 24 Z" fill="#34d399" stroke="#047857" strokeWidth="0.8" />
      <path d="M27 24 C24 19 20 19 18 22 C21 25 24 26 27 24 Z" fill="#10b981" stroke="#047857" strokeWidth="0.8" />
      {/* 5 Jasmine petals */}
      <g fill={`url(#r-jas-${id})`} stroke="#5eead4" strokeWidth="0.8">
        <ellipse cx="16" cy="7.5" rx="3.8" ry="6.5" />
        <ellipse cx="16" cy="7.5" rx="3.8" ry="6.5" transform="rotate(72 16 16)" />
        <ellipse cx="16" cy="7.5" rx="3.8" ry="6.5" transform="rotate(144 16 16)" />
        <ellipse cx="16" cy="7.5" rx="3.8" ry="6.5" transform="rotate(216 16 16)" />
        <ellipse cx="16" cy="7.5" rx="3.8" ry="6.5" transform="rotate(288 16 16)" />
      </g>
      <circle cx="16" cy="16" r="3.1" fill="#facc15" stroke="#a16207" strokeWidth="0.7" />
      <circle cx="15" cy="15" r="1.1" fill="#fef9c3" />
    </svg>
  );
}

function RainCrescentMoon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 32 32" className={styles.dropVisualSvg} aria-hidden="true">
      <defs>
        <linearGradient id={`r-moon-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <path
        d="M21 5.5 C13.5 6.2 8 12.4 8.5 19.8 C9 26.5 15 30 22 28.2 C16.4 26.8 13.5 21.8 14.2 16.2 C14.8 11.2 17.6 7.5 21 5.5 Z"
        fill={`url(#r-moon-${id})`}
        stroke="#854d0e"
        strokeWidth="1"
      />
      <path
        d="M22.5 10.5 C23 13.2 24.3 14.5 27 15 C24.3 15.5 23 16.8 22.5 19.5 C22 16.8 20.7 15.5 18 15 C20.7 14.5 22 13.2 22.5 10.5 Z"
        fill="#2dd4bf"
        stroke="#fef9c3"
        strokeWidth="0.7"
      />
    </svg>
  );
}

export default function PosJasmineRain({ trigger }: { trigger: number }) {
  const [bursts, setBursts] = useState<number[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const burstKey = Date.now() + trigger;
    setBursts(prev => [...prev.slice(-2), burstKey]);

    const timer = window.setTimeout(() => {
      setBursts(prev => prev.filter(item => item !== burstKey));
    }, 6800);

    return () => window.clearTimeout(timer);
  }, [trigger]);

  if (bursts.length === 0) return null;

  return (
    <div className={styles.rainViewport} aria-hidden="true">
      {bursts.map(burstKey => (
        <React.Fragment key={burstKey}>
          {JASMINE_DROPS.map(d => {
            const uid = `${burstKey}-${d.id}`;
            return (
              <div
                key={uid}
                className={styles.dropFallTrack}
                style={
                  {
                    '--left': d.left,
                    '--size': `${d.size}px`,
                    '--fall-duration': d.fallDuration,
                    '--fall-delay': d.fallDelay,
                    '--sway-duration': d.swayDuration,
                    '--spin-duration': d.spinDuration,
                    '--sway-amp': d.swayAmp,
                    '--wind-drift': d.windDrift,
                    '--rot-start': d.rotStart,
                    '--rot-end': d.rotEnd,
                    '--peak-opacity': d.peakOpacity,
                  } as React.CSSProperties
                }
              >
                <div className={styles.dropSwayTrack}>
                  {d.kind === 'lamp' ? (
                    <RainMagicLamp id={uid} />
                  ) : d.kind === 'gem' ? (
                    <RainTiaraGem id={uid} />
                  ) : d.kind === 'jasmine' ? (
                    <RainJasmineBlossom id={uid} />
                  ) : (
                    <RainCrescentMoon id={uid} />
                  )}
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
