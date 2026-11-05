'use client';

import { useId, type CSSProperties } from 'react';
import styles from './pos-neko-charge-particles.module.css';
import type { PosNekoVariant } from './PosNekoDecor';

type NekoBtnParticleKind = 'michi' | 'paw' | 'bell' | 'fish' | 'moon';

interface NekoBtnParticleSpec {
  kind: NekoBtnParticleKind;
  left: string;
  top: string;
  size: number;
  duration: string;
  delay: string;
  flutterDuration: string;
  driftX: string;
  driftY: string;
  rotStart: string;
  rotEnd: string;
  opacity: number;
}

const NEKO_BTN_PARTICLES: NekoBtnParticleSpec[] = [
  // Left cluster
  { kind: 'michi', left: '5%', top: '54%', size: 19, duration: '6.8s', delay: '-1.1s', flutterDuration: '2.6s', driftX: '24px', driftY: '-16px', rotStart: '-12deg', rotEnd: '14deg', opacity: 0.88 },
  { kind: 'paw', left: '13%', top: '26%', size: 14, duration: '5.5s', delay: '-3.4s', flutterDuration: '2.1s', driftX: '28px', driftY: '-12px', rotStart: '-22deg', rotEnd: '16deg', opacity: 0.84 },
  { kind: 'bell', left: '21%', top: '68%', size: 13, duration: '6.1s', delay: '-2.2s', flutterDuration: '2.3s', driftX: '22px', driftY: '-18px', rotStart: '-16deg', rotEnd: '18deg', opacity: 0.82 },

  // Soft center-edge accents
  { kind: 'moon', left: '33%', top: '20%', size: 13, duration: '5.9s', delay: '-4.2s', flutterDuration: '2.2s', driftX: '20px', driftY: '-11px', rotStart: '-18deg', rotEnd: '20deg', opacity: 0.72 },
  { kind: 'fish', left: '66%', top: '72%', size: 14, duration: '6.3s', delay: '-1.7s', flutterDuration: '2.4s', driftX: '-22px', driftY: '-14px', rotStart: '12deg', rotEnd: '-18deg', opacity: 0.72 },

  // Right cluster
  { kind: 'paw', left: '76%', top: '24%', size: 14, duration: '5.6s', delay: '-0.8s', flutterDuration: '2.1s', driftX: '-24px', driftY: '-13px', rotStart: '16deg', rotEnd: '-20deg', opacity: 0.84 },
  { kind: 'michi', left: '84%', top: '56%', size: 19, duration: '7.1s', delay: '-3.9s', flutterDuration: '2.7s', driftX: '-22px', driftY: '-16px', rotStart: '-14deg', rotEnd: '12deg', opacity: 0.88 },
  { kind: 'bell', left: '91%', top: '34%', size: 13, duration: '5.8s', delay: '-2.6s', flutterDuration: '2.2s', driftX: '-20px', driftY: '-14px', rotStart: '-15deg', rotEnd: '18deg', opacity: 0.8 },
];

const PURR_GLINTS = [
  { left: '10%', top: '36%', size: 4, duration: '2.9s', delay: '-0.5s' },
  { left: '25%', top: '46%', size: 3.5, duration: '3.4s', delay: '-1.8s' },
  { left: '74%', top: '50%', size: 3.5, duration: '3.1s', delay: '-2.3s' },
  { left: '89%', top: '30%', size: 4, duration: '2.7s', delay: '-1.1s' },
];

function NekoBtnGlyph({
  kind,
  furGradId,
  pawGradId,
  bellGradId,
  flutterStyle,
  isFernanda,
}: {
  kind: NekoBtnParticleKind;
  furGradId: string;
  pawGradId: string;
  bellGradId: string;
  flutterStyle: CSSProperties;
  isFernanda: boolean;
}) {
  if (kind === 'michi') {
    if (isFernanda) {
      return (
        <svg viewBox="0 0 40 36" className={styles.particleSvg} style={flutterStyle}>
          {/* Brown-Tabby Ears */}
          <path
            d="M 7 16 L 5 4 L 15 10 Z M 33 16 L 35 4 L 25 10 Z"
            fill="#4b3b30"
            stroke="#1f1610"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <path d="M 8 14 L 7 6.8 L 13.5 10.5 Z M 32 14 L 33 6.8 L 26.5 10.5 Z" fill="#fda4af" opacity="0.88" />
          {/* Snowy White Head */}
          <ellipse cx="20" cy="20" rx="13.5" ry="11" fill="#ffffff" stroke="#475569" strokeWidth="0.9" />
          {/* Brown-Tabby Cap over Left & Right Forehead with White Blaze */}
          <path d="M 6.8 18.5 C 7 11.5, 13 9, 18.4 10.2 C 18.8 14, 16 17.5, 11.5 19.5 Z" fill="#4b3b30" />
          <path d="M 33.2 18.5 C 33 11.5, 27 9, 21.6 10.2 C 21.2 14, 24 17.5, 28.5 19.5 Z" fill="#4b3b30" />
          {/* Fernanda's Cat Nose Smudge */}
          <ellipse cx="19.5" cy="20.8" rx="2.1" ry="2.4" fill="#4b3b30" opacity="0.9" />
          {/* Olive-Green Eyes */}
          <circle cx="14.5" cy="18.8" r="2" fill="#84a93c" stroke="#1f1610" strokeWidth="0.6" />
          <circle cx="25.5" cy="18.8" r="2" fill="#84a93c" stroke="#1f1610" strokeWidth="0.6" />
          <circle cx="14" cy="18.2" r="0.6" fill="#ffffff" />
          <circle cx="25" cy="18.2" r="0.6" fill="#ffffff" />
          {/* Terracotta-pink nose & mouth */}
          <polygon points="20,22.5 18.4,20.9 21.6,20.9" fill="#c46358" />
          <path
            d="M 17.2 23.8 Q 18.6 25.4 20 23.6 Q 21.4 25.4 22.8 23.8"
            fill="none"
            stroke="#3b2820"
            strokeWidth="1.05"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 40 36" className={styles.particleSvg} style={flutterStyle}>
        {/* Left & Right Cat Ears */}
        <path
          d="M 7 16 L 5 4 L 15 10 Z M 33 16 L 35 4 L 25 10 Z"
          fill={`url(#${furGradId})`}
          stroke="#9a3e0e"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        <path d="M 8 14 L 7 6.8 L 13.5 10.5 Z M 32 14 L 33 6.8 L 26.5 10.5 Z" fill="#fda4af" opacity="0.85" />
        {/* Head */}
        <ellipse
          cx="20"
          cy="20"
          rx="13.5"
          ry="11"
          fill={`url(#${furGradId})`}
          stroke="#9a3e0e"
          strokeWidth="0.9"
        />
        {/* Tabby forehead stripes */}
        <path
          d="M 17 11.2 L 18.2 14.8 M 20 10.6 L 20 14.5 M 23 11.2 L 21.8 14.8"
          stroke="#b44d12"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        {/* Cream muzzle & cheeks */}
        <ellipse cx="20" cy="23.5" rx="7.5" ry="5.5" fill="#fff7ed" opacity="0.92" />
        <ellipse cx="11.8" cy="22.2" rx="2.4" ry="1.4" fill="#fb7185" opacity="0.55" />
        <ellipse cx="28.2" cy="22.2" rx="2.4" ry="1.4" fill="#fb7185" opacity="0.55" />
        {/* Happy curved eyes */}
        <path
          d="M 13 19.2 Q 14.8 17.2 16.6 19.2 M 23.4 19.2 Q 25.2 17.2 27 19.2"
          fill="none"
          stroke="#431407"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        {/* Pink nose & :3 mouth */}
        <polygon points="20,22.2 18.5,20.6 21.5,20.6" fill="#f43f5e" />
        <path
          d="M 17.2 23.6 Q 18.6 25.2 20 23.4 Q 21.4 25.2 22.8 23.6"
          fill="none"
          stroke="#5c2409"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'moon') {
    return (
      <svg viewBox="0 0 28 28" className={styles.particleSvg} style={flutterStyle}>
        <path
          d="M 18.5 3.5 C 12 3.8, 7 9.2, 7 15.8 C 7 21.5, 11.5 25, 17.2 24.2 C 12.5 22.8, 10.8 18.5, 11.5 13.8 C 12.2 9.2, 15.2 5.6, 18.5 3.5 Z"
          fill={`url(#${bellGradId})`}
          stroke="#a16207"
          strokeWidth="0.9"
        />
      </svg>
    );
  }

  if (kind === 'bell') {
    return (
      <svg viewBox="0 0 28 28" className={styles.particleSvg} style={flutterStyle}>
        <circle cx="14" cy="5.5" r="2.4" fill="none" stroke="#fef08a" strokeWidth="1.4" />
        <circle cx="14" cy="15.5" r="8.5" fill={`url(#${bellGradId})`} stroke="#a16207" strokeWidth="0.9" />
        <path d="M 6 14.5 H 22" stroke="#a16207" strokeWidth="1" />
        <circle cx="14" cy="18.8" r="1.8" fill="#713f12" />
        <line x1="14" y1="20.2" x2="14" y2="23.8" stroke="#713f12" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'fish') {
    return (
      <svg viewBox="0 0 34 24" className={styles.particleSvg} style={flutterStyle}>
        <path
          d="M 24 12 L 31 6 L 30 12 L 31 18 Z"
          fill={`url(#${furGradId})`}
          stroke={isFernanda ? '#881337' : '#9a3e0e'}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        <path
          d="M 3 12 C 7 4.5, 18 4.5, 25 12 C 18 19.5, 7 19.5, 3 12 Z"
          fill={`url(#${furGradId})`}
          stroke={isFernanda ? '#881337' : '#9a3e0e'}
          strokeWidth="0.85"
        />
        <circle cx="9.5" cy="10.8" r="1.2" fill="#431407" />
        <path
          d="M 14 9.2 Q 16 12 14 14.8 M 18 9.6 Q 19.8 12 18 14.4"
          fill="none"
          stroke={isFernanda ? '#881337' : '#9a3e0e'}
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Default: Cushioned Toe-Bean Paw Print (`paw`)
  return (
    <svg viewBox="0 0 32 32" className={styles.particleSvg} style={flutterStyle}>
      <circle cx="16" cy="16" r="14" fill="#fff7ed" opacity="0.9" />
      <path
        d="M 16 15.5 C 12 15.5, 9.5 18.5, 10.5 22 C 11.2 24.2, 13.8 24.2, 16 23.2 C 18.2 24.2, 20.8 24.2, 21.5 22 C 22.5 18.5, 20 15.5, 16 15.5 Z"
        fill={`url(#${pawGradId})`}
      />
      <ellipse cx="9.5" cy="13.5" rx="2.3" ry="3.1" transform="rotate(-22 9.5 13.5)" fill={`url(#${pawGradId})`} />
      <ellipse cx="13.6" cy="10.6" rx="2.3" ry="3.2" transform="rotate(-7 13.6 10.6)" fill={`url(#${pawGradId})`} />
      <ellipse cx="18.4" cy="10.6" rx="2.3" ry="3.2" transform="rotate(7 18.4 10.6)" fill={`url(#${pawGradId})`} />
      <ellipse cx="22.5" cy="13.5" rx="2.3" ry="3.1" transform="rotate(22 22.5 13.5)" fill={`url(#${pawGradId})`} />
    </svg>
  );
}

/**
 * Artisanal Cat & Paw particle system rendered inside the "Cobrar" button
 * when `neko-mikan` or `neko-nocturno` is active.
 */
export default function PosNekoChargeParticles({
  nekoVariant = 'mikan',
}: {
  nekoVariant?: PosNekoVariant;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const furGradId = `neko-btn-f-${uid}`;
  const pawGradId = `neko-btn-p-${uid}`;
  const bellGradId = `neko-btn-b-${uid}`;
  const isFernanda = nekoVariant === 'fernanda';

  return (
    <span className={styles.stage} aria-hidden="true">
      <svg className={styles.defsSvg} aria-hidden="true">
        <defs>
          <linearGradient id={furGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isFernanda ? '#fff1f2' : '#fff7ed'} />
            <stop offset="45%" stopColor={isFernanda ? '#fda4af' : '#fdba74'} />
            <stop offset="100%" stopColor={isFernanda ? '#e11d48' : '#ea580c'} />
          </linearGradient>
          <linearGradient id={pawGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor={isFernanda ? '#be123c' : '#ea580c'} />
          </linearGradient>
          <radialGradient id={bellGradId} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ca8a04" />
          </radialGradient>
        </defs>
      </svg>

      <span className={styles.sheen} />

      {PURR_GLINTS.map((d, idx) => (
        <span
          key={`dew-${idx}`}
          className={styles.dew}
          style={{
            left: d.left,
            top: d.top,
            width: `${d.size}px`,
            height: `${d.size}px`,
            animationDuration: d.duration,
            animationDelay: d.delay,
          }}
        />
      ))}

      {NEKO_BTN_PARTICLES.map((p, idx) => {
        const wrapStyle: CSSProperties = {
          left: p.left,
          top: p.top,
          width: `${p.size}px`,
          height: `${p.size}px`,
          animationDuration: p.duration,
          animationDelay: p.delay,
          ['--drift-x' as string]: p.driftX,
          ['--drift-y' as string]: p.driftY,
          ['--p-opacity' as string]: String(p.opacity),
        };

        const flutterStyle: CSSProperties = {
          animationDuration: p.flutterDuration,
          animationDelay: p.delay,
          ['--rot-start' as string]: p.rotStart,
          ['--rot-end' as string]: p.rotEnd,
        };

        return (
          <span key={`nbp-${idx}`} className={styles.particleWrap} style={wrapStyle}>
            <NekoBtnGlyph
              kind={p.kind}
              furGradId={furGradId}
              pawGradId={pawGradId}
              bellGradId={bellGradId}
              flutterStyle={flutterStyle}
              isFernanda={isFernanda}
            />
          </span>
        );
      })}
    </span>
  );
}
