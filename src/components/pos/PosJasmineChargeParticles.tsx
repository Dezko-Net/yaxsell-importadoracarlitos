'use client';

import React, { useId } from 'react';
import styles from './pos-jasmine-charge-particles.module.css';

interface JasmineButtonParticleConfig {
  id: number;
  x: string;
  y: string;
  size: number;
  dur: string;
  sway: string;
  delay: string;
  rotStart: string;
  rotEnd: string;
  maxOpacity: number;
  variant: 'lamp' | 'gem' | 'jasmine' | 'lantern' | 'crescent';
}

interface StarParticleConfig {
  id: number;
  x: string;
  y: string;
  size: number;
  dur: string;
  delay: string;
}

const BUTTON_PARTICLES: JasmineButtonParticleConfig[] = [
  { id: 1, x: '4%', y: '58%', size: 19, dur: '5.2s', sway: '2.8s', delay: '0s', rotStart: '-14deg', rotEnd: '18deg', maxOpacity: 0.9, variant: 'lamp' },
  { id: 2, x: '14%', y: '22%', size: 16, dur: '4.8s', sway: '3.1s', delay: '-1.4s', rotStart: '10deg', rotEnd: '-16deg', maxOpacity: 0.86, variant: 'gem' },
  { id: 3, x: '24%', y: '66%', size: 15, dur: '5.5s', sway: '2.7s', delay: '-2.8s', rotStart: '-12deg', rotEnd: '24deg', maxOpacity: 0.84, variant: 'jasmine' },
  { id: 4, x: '35%', y: '18%', size: 17, dur: '5.9s', sway: '3.3s', delay: '-0.9s', rotStart: '-8deg', rotEnd: '14deg', maxOpacity: 0.86, variant: 'lantern' },
  { id: 5, x: '47%', y: '68%', size: 15, dur: '5.0s', sway: '2.9s', delay: '-3.4s', rotStart: '-16deg', rotEnd: '20deg', maxOpacity: 0.82, variant: 'crescent' },
  { id: 6, x: '58%', y: '24%', size: 18, dur: '5.4s', sway: '3.2s', delay: '-2.1s', rotStart: '12deg', rotEnd: '-18deg', maxOpacity: 0.88, variant: 'lamp' },
  { id: 7, x: '69%', y: '64%', size: 16, dur: '4.9s', sway: '2.8s', delay: '-3.9s', rotStart: '-10deg', rotEnd: '22deg', maxOpacity: 0.85, variant: 'gem' },
  { id: 8, x: '78%', y: '20%', size: 15, dur: '5.3s', sway: '3.0s', delay: '-1.6s', rotStart: '8deg', rotEnd: '28deg', maxOpacity: 0.84, variant: 'jasmine' },
  { id: 9, x: '86%', y: '62%', size: 17, dur: '5.7s', sway: '3.4s', delay: '-4.2s', rotStart: '-10deg', rotEnd: '16deg', maxOpacity: 0.86, variant: 'lantern' },
  { id: 10, x: '93%', y: '26%', size: 15, dur: '4.7s', sway: '2.6s', delay: '-0.7s', rotStart: '14deg', rotEnd: '-18deg', maxOpacity: 0.82, variant: 'crescent' },
];

const BUTTON_STARS: StarParticleConfig[] = [
  { id: 1, x: '10%', y: '34%', size: 10, dur: '2.9s', delay: '-0.5s' },
  { id: 2, x: '29%', y: '48%', size: 9, dur: '3.6s', delay: '-1.8s' },
  { id: 3, x: '43%', y: '36%', size: 8.5, dur: '3.2s', delay: '-0.9s' },
  { id: 4, x: '63%', y: '52%', size: 10, dur: '3.4s', delay: '-2.5s' },
  { id: 5, x: '75%', y: '38%', size: 8.5, dur: '2.8s', delay: '-1.3s' },
  { id: 6, x: '90%', y: '48%', size: 9.5, dur: '3.1s', delay: '-2.1s' },
];

function JasmineMagicLamp({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 36 26" className={styles.itemSvg} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-lamp`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="48%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      {/* Magic stardust wisp from spout */}
      <path
        d="M30.5 7.5 C32.8 5.8 34.5 4.2 33.2 2.4 C31.8 1.2 29.8 2.8 31.2 4.5"
        fill="none"
        stroke="#fef08a"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Lamp base */}
      <ellipse cx="15.5" cy="21" rx="5.2" ry="1.8" fill="#a16207" stroke="#713f12" strokeWidth="0.6" />
      <path d="M12.5 17.5 L18.5 17.5 L19.8 20.6 L11.2 20.6 Z" fill={`url(#${uid}-lamp)`} stroke="#854d0e" strokeWidth="0.6" />
      {/* Lamp body + elongated spout */}
      <path
        d="M6.5 12.8 C6.5 9.8 10.8 8.8 15.5 8.8 C20.2 8.8 23.2 10.4 26.8 8.2 C28.8 7 30.8 6.6 32.2 7.5 C30.4 9.5 27.6 12 24.4 13.8 C21.5 15.4 18.8 17.5 15.5 17.5 C11 17.5 6.5 15.5 6.5 12.8 Z"
        fill={`url(#${uid}-lamp)`}
        stroke="#854d0e"
        strokeWidth="0.9"
      />
      {/* Handle */}
      <path
        d="M8.2 11 C4 9.5 2.8 14.2 6.5 15.6 C8.2 16.2 9.2 14.8 9 13.5"
        fill="none"
        stroke="#fef08a"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Lid dome */}
      <path d="M12.2 8.8 C12.2 6 18.8 6 18.8 8.8 Z" fill="#fef08a" stroke="#854d0e" strokeWidth="0.8" />
      <circle cx="15.5" cy="5.2" r="1.4" fill="#fde047" stroke="#854d0e" strokeWidth="0.5" />
      {/* Turquoise jewel in center */}
      <ellipse cx="15.5" cy="13.2" rx="2" ry="2.4" fill="#2dd4bf" stroke="#fef9c3" strokeWidth="0.7" />
      <ellipse cx="14.9" cy="12.4" rx="0.6" ry="0.9" fill="#ffffff" />
    </svg>
  );
}

function JasmineTiaraGem({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 28 28" className={styles.itemSvg} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-gem`} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#99f6e4" />
          <stop offset="45%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      {/* Side golden filigree wings */}
      <path d="M5.5 15 C2 13.5 1.8 17.5 5.2 18.2" fill="none" stroke="#fef08a" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M22.5 15 C26 13.5 26.2 17.5 22.8 18.2" fill="none" stroke="#fef08a" strokeWidth="1.3" strokeLinecap="round" />
      {/* Top feather plume */}
      <path d="M14 1.5 C16.2 4.5 16 6.2 14 7.5 C12 6.2 11.8 4.5 14 1.5 Z" fill="#ffffff" stroke="#bae6fd" strokeWidth="0.6" />
      {/* Gold bezel setting */}
      <ellipse cx="14" cy="15.2" rx="7.8" ry="9.4" fill="#facc15" stroke="#a16207" strokeWidth="1" />
      {/* Inner turquoise sapphire cabochon */}
      <ellipse cx="14" cy="15.2" rx="5.6" ry="7.2" fill={`url(#${uid}-gem)`} stroke="#fef9c3" strokeWidth="0.75" />
      {/* Specular gleam */}
      <ellipse cx="12.2" cy="12" rx="1.6" ry="2.6" transform="rotate(-18 12.2 12)" fill="#ffffff" fillOpacity="0.82" />
    </svg>
  );
}

function JasmineBlossom({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 26 26" className={styles.itemSvg} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-fl`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="35%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#bae6fd" />
        </radialGradient>
      </defs>
      <g fill={`url(#${uid}-fl)`} stroke="#7dd3fc" strokeWidth="0.65">
        <ellipse cx="13" cy="6" rx="3.3" ry="5.3" />
        <ellipse cx="13" cy="6" rx="3.3" ry="5.3" transform="rotate(72 13 13)" />
        <ellipse cx="13" cy="6" rx="3.3" ry="5.3" transform="rotate(144 13 13)" />
        <ellipse cx="13" cy="6" rx="3.3" ry="5.3" transform="rotate(216 13 13)" />
        <ellipse cx="13" cy="6" rx="3.3" ry="5.3" transform="rotate(288 13 13)" />
      </g>
      <circle cx="13" cy="13" r="2.7" fill="#facc15" stroke="#ca8a04" strokeWidth="0.5" />
      <circle cx="12.2" cy="12.2" r="0.95" fill="#fef9c3" />
    </svg>
  );
}

function JasmineLantern({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 24 30" className={styles.itemSvg} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-lan`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
      </defs>
      {/* Hanging ring */}
      <circle cx="12" cy="3" r="1.6" fill="none" stroke="#fef08a" strokeWidth="1" />
      {/* Dome roof */}
      <path d="M7.5 8.5 C7.5 5.2 12 4.2 12 3.2 C12 4.2 16.5 5.2 16.5 8.5 Z" fill="#facc15" stroke="#854d0e" strokeWidth="0.8" />
      {/* Glowing glass body */}
      <path d="M8 8.5 L16 8.5 L14.8 19.5 L9.2 19.5 Z" fill={`url(#${uid}-lan)`} stroke="#854d0e" strokeWidth="0.9" />
      {/* Filigree lattice */}
      <line x1="12" y1="8.5" x2="12" y2="19.5" stroke="#b45309" strokeWidth="0.75" />
      {/* Turquoise gem in center */}
      <circle cx="12" cy="14" r="1.7" fill="#2dd4bf" stroke="#fef9c3" strokeWidth="0.5" />
      {/* Bottom finial */}
      <path d="M9.2 19.5 L14.8 19.5 L12 24.5 Z" fill="#facc15" stroke="#854d0e" strokeWidth="0.8" />
      <circle cx="12" cy="26.2" r="1.2" fill="#2dd4bf" />
    </svg>
  );
}

function JasmineCrescent({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 24 24" className={styles.itemSvg} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-moon`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      {/* Golden Crescent Moon */}
      <path
        d="M15.8 3.5 C10.2 3.8 6 8.5 6 14.2 C6 19.2 9.8 22.2 14.8 21.5 C10.8 20.2 9.2 16.5 9.8 12.4 C10.4 8.5 13 5.5 15.8 3.5 Z"
        fill={`url(#${uid}-moon)`}
        stroke="#854d0e"
        strokeWidth="0.8"
      />
      {/* Companion turquoise star */}
      <path
        d="M17.5 7.2 L18.3 9.5 L20.6 10.3 L18.3 11.1 L17.5 13.4 L16.7 11.1 L14.4 10.3 L16.7 9.5 Z"
        fill="#5eead4"
        stroke="#fef9c3"
        strokeWidth="0.5"
      />
    </svg>
  );
}

export default function PosJasmineChargeParticles() {
  const rawId = useId().replace(/:/g, '');

  return (
    <span className={styles.particleField} aria-hidden="true">
      <span className={styles.softGlow} />

      {BUTTON_PARTICLES.map(p => {
        const uid = `${rawId}-${p.id}`;
        return (
          <span
            key={p.id}
            className={styles.itemSlot}
            style={
              {
                '--x': p.x,
                '--y': p.y,
                '--size': `${p.size}px`,
                '--dur': p.dur,
                '--sway': p.sway,
                '--delay': p.delay,
                '--rot-start': p.rotStart,
                '--rot-end': p.rotEnd,
                '--max-opacity': p.maxOpacity,
              } as React.CSSProperties
            }
          >
            {p.variant === 'lamp' ? (
              <JasmineMagicLamp uid={uid} />
            ) : p.variant === 'gem' ? (
              <JasmineTiaraGem uid={uid} />
            ) : p.variant === 'lantern' ? (
              <JasmineLantern uid={uid} />
            ) : p.variant === 'crescent' ? (
              <JasmineCrescent uid={uid} />
            ) : (
              <JasmineBlossom uid={uid} />
            )}
          </span>
        );
      })}

      {BUTTON_STARS.map(s => (
        <span
          key={s.id}
          className={styles.starSlot}
          style={
            {
              '--x': s.x,
              '--y': s.y,
              '--size': `${s.size}px`,
              '--dur': s.dur,
              '--delay': s.delay,
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 16 16" className={styles.starSvg}>
            <path
              d="M8 0.5 C8.5 5.2 10.8 7.5 15.5 8 C10.8 8.5 8.5 10.8 8 15.5 C7.5 10.8 5.2 8.5 0.5 8 C5.2 7.5 7.5 5.2 8 0.5 Z"
              fill="#fef9c3"
            />
            <circle cx="8" cy="8" r="1.4" fill="#ffffff" />
          </svg>
        </span>
      ))}
    </span>
  );
}
