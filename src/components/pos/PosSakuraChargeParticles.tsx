'use client';

import { useId, type CSSProperties } from 'react';
import styles from './pos-sakura-charge-particles.module.css';

type PetalVariant = 'notched' | 'curled' | 'duo';
type TrajectoryId = 'A' | 'B' | 'C';

interface ButtonPetalSpec {
  left: string;
  size: number;
  duration: number;
  delay: number;
  flutterDuration: number;
  alpha: number;
  variant: PetalVariant;
  traj: TrajectoryId;
}

/**
 * Hand-choreographed breeze stream across the pill button:
 * Richer botanical presence on left/right flanks, whisper-soft across the center
 * so the "Cobrar $XX.XXX" typography stays 100% crisp and legible.
 */
const BUTTON_PETALS: ButtonPetalSpec[] = [
  { left: '4%', size: 15, duration: 5.4, delay: -0.6, flutterDuration: 2.9, alpha: 0.68, variant: 'notched', traj: 'A' },
  { left: '11%', size: 12, duration: 4.8, delay: -2.7, flutterDuration: 3.3, alpha: 0.56, variant: 'curled', traj: 'C' },
  { left: '19%', size: 14, duration: 6.1, delay: -4.1, flutterDuration: 3.6, alpha: 0.52, variant: 'duo', traj: 'B' },
  { left: '26%', size: 11, duration: 5.2, delay: -1.4, flutterDuration: 2.8, alpha: 0.42, variant: 'notched', traj: 'A' },
  { left: '36%', size: 10, duration: 5.8, delay: -3.5, flutterDuration: 3.5, alpha: 0.26, variant: 'curled', traj: 'C' },
  { left: '49%', size: 9, duration: 6.4, delay: -1.9, flutterDuration: 3.8, alpha: 0.22, variant: 'notched', traj: 'B' },
  { left: '62%', size: 10, duration: 5.5, delay: -4.6, flutterDuration: 3.1, alpha: 0.26, variant: 'curled', traj: 'A' },
  { left: '73%', size: 12, duration: 5.0, delay: -0.9, flutterDuration: 2.7, alpha: 0.46, variant: 'notched', traj: 'C' },
  { left: '80%', size: 15, duration: 5.9, delay: -3.1, flutterDuration: 3.4, alpha: 0.60, variant: 'duo', traj: 'B' },
  { left: '87%', size: 13, duration: 4.7, delay: -2.1, flutterDuration: 3.0, alpha: 0.58, variant: 'curled', traj: 'A' },
  { left: '93%', size: 15, duration: 5.6, delay: -4.2, flutterDuration: 3.2, alpha: 0.66, variant: 'notched', traj: 'B' },
];

const DEW_GLINTS: Array<{ left: string; top: string; size: number; delay: number }> = [
  { left: '9%', top: '24%', size: 7, delay: -0.5 },
  { left: '23%', top: '68%', size: 6, delay: -2.1 },
  { left: '78%', top: '26%', size: 6, delay: -1.3 },
  { left: '91%', top: '66%', size: 7, delay: -3.0 },
];

function SakuraFullBlossom({
  gradId,
  centerGradId,
  className,
}: {
  gradId: string;
  centerGradId: string;
  className: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* 5 sculpted notched sakura petals (Prunus serrulata) */}
      {[0, 72, 144, 216, 288].map(deg => (
        <g key={deg} transform={`rotate(${deg} 32 32)`}>
          <path
            d="M 32 30.2 C 25.2 24.6, 21.2 16.4, 25.0 9.0 C 26.4 6.2, 29.2 6.6, 32 11.2 C 34.8 6.6, 37.6 6.2, 39.0 9.0 C 42.8 16.4, 38.8 24.6, 32 30.2 Z"
            fill={`url(#${gradId})`}
            stroke="var(--sakura-p-stroke)"
            strokeWidth="0.65"
          />
          {/* Subtle central petal fold crease */}
          <path
            d="M 32 27.5 L 32 14.5"
            stroke="var(--sakura-p-stroke)"
            strokeWidth="0.6"
            strokeLinecap="round"
            opacity="0.55"
          />
        </g>
      ))}
      {/* Soft warm calyx heart */}
      <circle cx="32" cy="32" r="7.5" fill={`url(#${centerGradId})`} />
      {/* Radiating botanical stamens & pearl-gold anthers */}
      {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg, idx) => {
        const len = idx % 2 === 0 ? 23.2 : 24.8;
        return (
          <g key={deg} transform={`rotate(${deg} 32 32)`}>
            <line
              x1="32"
              y1="32"
              x2="32"
              y2={len}
              stroke="var(--sakura-p-stamen)"
              strokeWidth="0.75"
              strokeLinecap="round"
              opacity="0.8"
            />
            <circle cx="32" cy={len} r="1.15" fill="var(--sakura-p-stamen)" />
          </g>
        );
      })}
      <circle cx="32" cy="32" r="1.9" fill="var(--sakura-p-center)" />
    </svg>
  );
}

function PetalGlyph({ variant, gradId }: { variant: PetalVariant; gradId: string }) {
  if (variant === 'curled') {
    return (
      <svg viewBox="0 0 32 32" className={styles.petalInner} aria-hidden="true">
        {/* 3/4 breeze-cupped sakura petal */}
        <path
          d="M 6.5 26.5 C 4.5 18, 8.8 7.6, 18.2 4.6 C 20.8 3.8, 21.8 5.5, 20.4 8.5 C 23.6 7.6, 25.8 9.2, 24.6 12.4 C 21.8 20.0, 14.2 25.8, 6.5 26.5 Z"
          fill={`url(#${gradId})`}
          stroke="var(--sakura-p-stroke)"
          strokeWidth="0.65"
        />
        {/* Turned pearl underside fold */}
        <path
          d="M 6.5 26.5 C 6.2 19.2, 10.4 10.6, 18.2 4.6 C 14.6 11.6, 11.4 18.8, 6.5 26.5 Z"
          fill="var(--sakura-p-stop1)"
          opacity="0.55"
        />
      </svg>
    );
  }

  if (variant === 'duo') {
    return (
      <svg viewBox="0 0 36 36" className={styles.petalInner} aria-hidden="true">
        {/* Secondary trailing mini petal */}
        <g transform="translate(10, 6) rotate(28 12 16) scale(0.72)" opacity="0.72">
          <path
            d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
            fill={`url(#${gradId})`}
          />
        </g>
        {/* Primary leading notched petal */}
        <g transform="translate(-3, -1) rotate(-14 16 18) scale(0.86)">
          <path
            d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
            fill={`url(#${gradId})`}
            stroke="var(--sakura-p-stroke)"
            strokeWidth="0.65"
          />
        </g>
      </svg>
    );
  }

  // Classic front-facing heart-cleft sakura petal
  return (
    <svg viewBox="0 0 32 36" className={styles.petalInner} aria-hidden="true">
      <path
        d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
        fill={`url(#${gradId})`}
        stroke="var(--sakura-p-stroke)"
        strokeWidth="0.65"
      />
      <path
        d="M 16 30.5 Q 14.4 20 13.2 12.5 M 16 30.5 Q 17.6 20 18.8 12.5"
        fill="none"
        stroke="var(--sakura-p-stroke)"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export default function PosSakuraChargeParticles() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const petalGradId = `sakura-btn-p-${uid}`;
  const centerGradId = `sakura-btn-c-${uid}`;

  return (
    <span className={styles.layer} aria-hidden="true">
      <svg className={styles.defsSvg} aria-hidden="true">
        <defs>
          <linearGradient id={petalGradId} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="var(--sakura-p-stop1)" />
            <stop offset="58%" stopColor="var(--sakura-p-stop2)" />
            <stop offset="100%" stopColor="var(--sakura-p-stop3)" />
          </linearGradient>
          <radialGradient id={centerGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--sakura-p-center)" />
            <stop offset="100%" stopColor="var(--sakura-p-center)" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      <span className={styles.silkWash} />

      {/* Sculpted 5-petal corner sakura blossoms */}
      <SakuraFullBlossom
        gradId={petalGradId}
        centerGradId={centerGradId}
        className={styles.blossomLeft}
      />
      <SakuraFullBlossom
        gradId={petalGradId}
        centerGradId={centerGradId}
        className={styles.blossomRight}
      />
      <SakuraFullBlossom
        gradId={petalGradId}
        centerGradId={centerGradId}
        className={styles.blossomMiniLeft}
      />
      <SakuraFullBlossom
        gradId={petalGradId}
        centerGradId={centerGradId}
        className={styles.blossomMiniRight}
      />

      {/* Continuous diagonal spring-breeze sakura petals */}
      {BUTTON_PETALS.map((p, idx) => {
        const trajClass =
          p.traj === 'A' ? styles.trajA : p.traj === 'B' ? styles.trajB : styles.trajC;
        const pStyle: CSSProperties = {
          left: p.left,
          width: `${p.size}px`,
          height: `${p.size}px`,
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`,
          ['--p-alpha' as string]: String(p.alpha),
        };
        return (
          <span key={idx} className={`${styles.driftingPetal} ${trajClass}`} style={pStyle}>
            <PetalGlyph variant={p.variant} gradId={petalGradId} />
          </span>
        );
      })}

      {/* Delicate botanical dew glints */}
      {DEW_GLINTS.map((g, idx) => (
        <svg
          key={idx}
          viewBox="0 0 16 16"
          className={styles.dewGlint}
          style={{
            left: g.left,
            top: g.top,
            width: `${g.size}px`,
            height: `${g.size}px`,
            animationDelay: `${g.delay}s`,
          }}
        >
          <path
            d="M 8 1 C 8.4 5.2, 10.8 7.6, 15 8 C 10.8 8.4, 8.4 10.8, 8 15 C 7.6 10.8, 5.2 8.4, 1 8 C 5.2 7.6, 7.6 5.2, 8 1 Z"
            fill="var(--sakura-p-glint)"
          />
        </svg>
      ))}
    </span>
  );
}
