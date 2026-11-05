'use client';

import { useId, type CSSProperties } from 'react';
import styles from './pos-sakura-decor.module.css';

type AmbientGlyphKind = 'blossom' | 'notched' | 'curled' | 'duo';

interface AmbientParticleSpec {
  left: number;
  size: number;
  kind: AmbientGlyphKind;
  fallDuration: number;
  fallDelay: number;
  swayDuration: number;
  swayDelay: number;
  swayX: number;
  swayDeg: number;
  driftX: number;
  spinDuration: number;
  spinReverse?: boolean;
  alpha: number;
}

const CART_AMBIENT_PARTICLES: AmbientParticleSpec[] = [
  { left: 7, size: 20, kind: 'blossom', fallDuration: 11.5, fallDelay: -1.8, swayDuration: 3.1, swayDelay: -0.6, swayX: 13, swayDeg: 12, driftX: 24, spinDuration: 9.2, alpha: 0.62 },
  { left: 17, size: 13, kind: 'notched', fallDuration: 9.4, fallDelay: -6.2, swayDuration: 2.5, swayDelay: -1.3, swayX: 16, swayDeg: 18, driftX: 32, spinDuration: 6.4, spinReverse: true, alpha: 0.58 },
  { left: 28, size: 15, kind: 'curled', fallDuration: 10.6, fallDelay: -3.7, swayDuration: 2.8, swayDelay: -0.9, swayX: 14, swayDeg: 15, driftX: -18, spinDuration: 7.1, alpha: 0.56 },
  { left: 39, size: 23, kind: 'blossom', fallDuration: 12.8, fallDelay: -8.9, swayDuration: 3.4, swayDelay: -2.1, swayX: 15, swayDeg: 10, driftX: 28, spinDuration: 10.4, spinReverse: true, alpha: 0.54 },
  { left: 50, size: 14, kind: 'notched', fallDuration: 9.8, fallDelay: -4.9, swayDuration: 2.6, swayDelay: -1.7, swayX: 18, swayDeg: 19, driftX: 22, spinDuration: 6.8, alpha: 0.60 },
  { left: 61, size: 17, kind: 'duo', fallDuration: 11.2, fallDelay: -10.1, swayDuration: 3.0, swayDelay: -0.4, swayX: 14, swayDeg: 14, driftX: -22, spinDuration: 8.2, spinReverse: true, alpha: 0.55 },
  { left: 71, size: 13, kind: 'curled', fallDuration: 8.9, fallDelay: -2.5, swayDuration: 2.4, swayDelay: -1.9, swayX: 15, swayDeg: 17, driftX: 26, spinDuration: 6.1, alpha: 0.58 },
  { left: 81, size: 21, kind: 'blossom', fallDuration: 12.2, fallDelay: -7.4, swayDuration: 3.3, swayDelay: -1.1, swayX: 12, swayDeg: 11, driftX: -16, spinDuration: 9.6, alpha: 0.60 },
  { left: 90, size: 14, kind: 'notched', fallDuration: 10.1, fallDelay: -5.3, swayDuration: 2.7, swayDelay: -2.4, swayX: 15, swayDeg: 16, driftX: -24, spinDuration: 6.9, spinReverse: true, alpha: 0.56 },
  { left: 23, size: 12, kind: 'notched', fallDuration: 8.6, fallDelay: -0.9, swayDuration: 2.3, swayDelay: -0.8, swayX: 12, swayDeg: 16, driftX: 19, spinDuration: 5.8, alpha: 0.52 },
  { left: 56, size: 19, kind: 'blossom', fallDuration: 13.4, fallDelay: -11.4, swayDuration: 3.6, swayDelay: -1.5, swayX: 14, swayDeg: 10, driftX: 20, spinDuration: 10.8, alpha: 0.50 },
  { left: 76, size: 12, kind: 'curled', fallDuration: 9.2, fallDelay: -8.1, swayDuration: 2.5, swayDelay: -0.5, swayX: 13, swayDeg: 15, driftX: 18, spinDuration: 6.3, spinReverse: true, alpha: 0.54 },
];

const MODAL_AMBIENT_PARTICLES: AmbientParticleSpec[] = CART_AMBIENT_PARTICLES.filter((_, idx) => idx % 2 === 0).map(
  p => ({
    ...p,
    alpha: Math.round(p.alpha * 0.72 * 100) / 100,
    fallDuration: Math.round(p.fallDuration * 0.85 * 10) / 10,
  })
);

const AMBIENT_DEW = [
  { left: '14%', top: '18%', size: 5, duration: '3.4s', delay: '-0.6s' },
  { left: '34%', top: '42%', size: 4, duration: '4.1s', delay: '-1.9s' },
  { left: '66%', top: '26%', size: 5, duration: '3.7s', delay: '-2.5s' },
  { left: '84%', top: '58%', size: 4, duration: '4.4s', delay: '-1.1s' },
  { left: '46%', top: '76%', size: 5, duration: '3.9s', delay: '-2.9s' },
];

/**
 * Reusable 5-petal cleft Somei-Yoshino Sakura blossom (`桜`) SVG group
 * centered at (0, 0) with radius ~22 units.
 */
function SakuraBlossomGroup({
  petalGradId,
  centerGradId,
  scale = 1,
  rotate = 0,
  x = 0,
  y = 0,
}: {
  petalGradId: string;
  centerGradId: string;
  scale?: number;
  rotate?: number;
  x?: number;
  y?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      {[0, 72, 144, 216, 288].map(deg => (
        <g key={deg} transform={`rotate(${deg})`}>
          <path
            d="M 0 -1.8 C -6.8 -7.4, -10.8 -15.6, -7.0 -23.0 C -5.6 -25.8, -2.8 -25.4, 0 -20.8 C 2.8 -25.4, 5.6 -25.8, 7.0 -23.0 C 10.8 -15.6, 6.8 -7.4, 0 -1.8 Z"
            fill={`url(#${petalGradId})`}
            stroke="#e375a0"
            strokeWidth="0.7"
            strokeOpacity="0.62"
          />
          <path
            d="M 0 -4.2 L 0 -17.0"
            stroke="#df6d99"
            strokeWidth="0.55"
            strokeLinecap="round"
            opacity="0.36"
          />
        </g>
      ))}
      <circle cx="0" cy="0" r="7.6" fill={`url(#${centerGradId})`} />
      {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg, idx) => {
        const len = idx % 2 === 0 ? -8.6 : -7.0;
        return (
          <g key={deg} transform={`rotate(${deg})`}>
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={len}
              stroke="#e59838"
              strokeWidth="0.8"
              strokeLinecap="round"
              opacity="0.85"
            />
            <circle cx="0" cy={len} r="1.15" fill="#fbbf24" />
          </g>
        );
      })}
      <circle cx="0" cy="0" r="2.1" fill="#be2966" opacity="0.85" />
    </g>
  );
}

/**
 * Unopened Sakura spring bud (`蕾`) with warm sage-plum calyx sepals.
 */
function SakuraBudGroup({
  budGradId,
  x,
  y,
  rotate = 0,
  scale = 1,
}: {
  budGradId: string;
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path
        d="M 0 0 C -4.6 -4.5, -5.2 -12.5, 0 -17.2 C 5.2 -12.5, 4.6 -4.5, 0 0 Z"
        fill={`url(#${budGradId})`}
        stroke="#db6895"
        strokeWidth="0.65"
      />
      <path
        d="M -0.8 -12.5 C -0.4 -8.5, 1.2 -6.0, 1.8 -2.8"
        fill="none"
        stroke="#fff6fa"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M 0 1.2 C -2.8 -0.8, -3.5 -3.6, -2.2 -6.0 C -0.8 -4.0, -0.4 -2.2, 0 -1.2 C 0.4 -2.2, 0.8 -4.0, 2.2 -6.0 C 3.5 -3.6, 2.8 -0.8, 0 1.2 Z"
        fill="#884a62"
      />
    </g>
  );
}

/**
 * Asymmetric, wind-swept Japanese cherry blossom petal (`桜の花びら`) with 3D curled fold.
 * Uses an outer `<g transform=...>` and inner animated `<g>` so CSS keyframes never
 * overwrite SVG position/rotation/scale or stack petals together.
 */
function SakuraBreezePetal({
  petalGradId,
  x,
  y,
  rotate = 0,
  scale = 1,
  variant = 'a',
}: {
  petalGradId: string;
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
  variant?: 'a' | 'b';
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <g className={variant === 'a' ? styles.floatingPetalA : styles.floatingPetalB}>
        <path
          d="M -14 2.2 C -9.2 -5.4, 2.4 -8.2, 12.6 -3.8 C 14.4 -3.0, 14.2 -1.2, 10.6 -0.2 C 13.8 1.2, 13.6 3.0, 11.4 4.0 C 2.2 8.2, -8.4 6.4, -14 2.2 Z"
          fill={`url(#${petalGradId})`}
          stroke="#e375a0"
          strokeWidth="0.7"
          strokeOpacity="0.6"
        />
        <path
          d="M -14 2.2 C -8.6 -3.6, 1.2 -6.2, 10.8 -3.4 C 3.4 -2.4, -4.8 -0.4, -14 2.2 Z"
          fill="#fff9fc"
          opacity="0.72"
        />
        <path
          d="M -11.5 1.8 Q -1.5 0.2 8.2 -0.4"
          fill="none"
          stroke="#df6d99"
          strokeWidth="0.5"
          strokeLinecap="round"
          opacity="0.38"
        />
      </g>
    </g>
  );
}

function AmbientGlyphSvg({
  kind,
  petalGradId,
  centerGradId,
  spinStyle,
}: {
  kind: AmbientGlyphKind;
  petalGradId: string;
  centerGradId: string;
  spinStyle: CSSProperties;
}) {
  if (kind === 'blossom') {
    return (
      <svg viewBox="-28 -28 56 56" className={styles.ambientSpinGlyph} style={spinStyle}>
        <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} />
      </svg>
    );
  }

  if (kind === 'curled') {
    return (
      <svg viewBox="0 0 32 32" className={styles.ambientSpinGlyph} style={spinStyle}>
        <path
          d="M 6.5 26.5 C 4.5 18, 8.8 7.6, 18.2 4.6 C 20.8 3.8, 21.8 5.5, 20.4 8.5 C 23.6 7.6, 25.8 9.2, 24.6 12.4 C 21.8 20.0, 14.2 25.8, 6.5 26.5 Z"
          fill={`url(#${petalGradId})`}
          stroke="#e375a0"
          strokeWidth="0.65"
          strokeOpacity="0.55"
        />
        <path
          d="M 6.5 26.5 C 6.2 19.2, 10.4 10.6, 18.2 4.6 C 14.6 11.6, 11.4 18.8, 6.5 26.5 Z"
          fill="#fff8fb"
          opacity="0.65"
        />
      </svg>
    );
  }

  if (kind === 'duo') {
    return (
      <svg viewBox="0 0 36 36" className={styles.ambientSpinGlyph} style={spinStyle}>
        <g transform="translate(11, 5) rotate(28 12 16) scale(0.72)" opacity="0.82">
          <path
            d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
            fill={`url(#${petalGradId})`}
            stroke="#e375a0"
            strokeWidth="0.6"
            strokeOpacity="0.5"
          />
        </g>
        <g transform="translate(-3, -1) rotate(-14 16 18) scale(0.86)">
          <path
            d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
            fill={`url(#${petalGradId})`}
            stroke="#e375a0"
            strokeWidth="0.65"
            strokeOpacity="0.55"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 36" className={styles.ambientSpinGlyph} style={spinStyle}>
      <path
        d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
        fill={`url(#${petalGradId})`}
        stroke="#e375a0"
        strokeWidth="0.65"
        strokeOpacity="0.55"
      />
      <path
        d="M 16 30.5 Q 14.4 20 13.2 12.5 M 16 30.5 Q 17.6 20 18.8 12.5"
        fill="none"
        stroke="#df6d99"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.36"
      />
    </svg>
  );
}

/**
 * Continuous, silky-smooth Sakura ambient particle layer + corner botanical sprigs.
 * Used in the background of "Venta actual", "Una venta empieza aquí", and "Venta cobrada".
 */
export function PosSakuraAmbientField({
  variant = 'cart',
}: {
  variant?: 'cart' | 'search' | 'modal';
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const petalGradId = `sakura-amb-p-${uid}`;
  const centerGradId = `sakura-amb-c-${uid}`;
  const budGradId = `sakura-amb-b-${uid}`;

  const particles = variant === 'modal' ? MODAL_AMBIENT_PARTICLES : CART_AMBIENT_PARTICLES;
  const fallDist = variant === 'modal' ? '340px' : '680px';

  return (
    <div className={styles.ambientField} aria-hidden="true">
      <svg className={styles.defsSvg} aria-hidden="true">
        <defs>
          <linearGradient id={petalGradId} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#fff9fc" />
            <stop offset="54%" stopColor="#fbd0e3" />
            <stop offset="100%" stopColor="#eb85b0" />
          </linearGradient>
          <radialGradient id={centerGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d14278" stopOpacity="0.62" />
            <stop offset="65%" stopColor="#f472b6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fbcfe8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={budGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffeaf3" />
            <stop offset="55%" stopColor="#f59ec2" />
            <stop offset="100%" stopColor="#d95d8e" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top-right delicate Japanese Sakura branch watermark */}
      <svg
        viewBox="0 0 210 140"
        className={`${styles.cornerBranch} ${variant === 'modal' ? styles.cornerBranchModal : ''}`}
      >
        <path
          d="M 218 14 C 176 20, 142 36, 108 58 C 86 72, 64 80, 38 82"
          fill="none"
          stroke="#7e485b"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M 152 34 C 138 56, 128 76, 118 96"
          fill="none"
          stroke="#7e485b"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 108 58 C 90 48, 72 44, 54 46"
          fill="none"
          stroke="#8e5569"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <SakuraBudGroup budGradId={budGradId} x={38} y={82} rotate={-78} scale={0.78} />
        <SakuraBudGroup budGradId={budGradId} x={54} y={46} rotate={-95} scale={0.72} />
        <SakuraBudGroup budGradId={budGradId} x={118} y={96} rotate={-155} scale={0.76} />
        <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} x={162} y={32} scale={0.95} rotate={14} />
        <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} x={114} y={56} scale={0.78} rotate={-18} />
        <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} x={136} y={76} scale={0.62} rotate={28} />
      </svg>

      {/* Bottom-left soft sprig watermark on cart & search */}
      {variant !== 'modal' && (
        <svg viewBox="0 0 170 115" className={styles.bottomSprig}>
          <path
            d="M -8 98 C 28 88, 58 72, 92 50 C 108 40, 122 34, 138 32"
            fill="none"
            stroke="#854e62"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <SakuraBudGroup budGradId={budGradId} x={138} y={32} rotate={76} scale={0.72} />
          <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} x={48} y={78} scale={0.82} rotate={-12} />
          <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} x={94} y={52} scale={0.64} rotate={22} />
        </svg>
      )}

      {/* Ambient pearl dew glints */}
      {AMBIENT_DEW.map((d, idx) => (
        <span
          key={idx}
          className={styles.ambientDew}
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

      {/* Continuous, silky-smooth floating Sakura blossoms & notched/curled petals */}
      {particles.map((p, idx) => {
        const fallStyle: CSSProperties = {
          left: `${p.left}%`,
          width: `${p.size}px`,
          height: `${p.size}px`,
          animationDuration: `${p.fallDuration}s, ${p.fallDuration}s`,
          animationDelay: `${p.fallDelay}s, ${p.fallDelay}s`,
          ['--drift-x' as string]: `${p.driftX}px`,
          ['--fall-dist' as string]: fallDist,
          ['--p-alpha' as string]: String(p.alpha),
        };

        const swayStyle: CSSProperties = {
          animationDuration: `${p.swayDuration}s`,
          animationDelay: `${p.swayDelay}s`,
          ['--sway-x' as string]: `${p.swayX}px`,
          ['--sway-deg' as string]: `${p.swayDeg}deg`,
        };

        const spinStyle: CSSProperties = {
          animationDuration: `${p.spinDuration}s`,
          animationDirection: p.spinReverse ? 'reverse' : 'normal',
        };

        return (
          <span key={idx} className={styles.ambientFallTrack} style={fallStyle}>
            <span className={styles.ambientSwayTrack} style={swayStyle}>
              <AmbientGlyphSvg
                kind={p.kind}
                petalGradId={petalGradId}
                centerGradId={centerGradId}
                spinStyle={spinStyle}
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Bespoke Sakura botanical centerpiece for "Una venta empieza aquí".
 */
export function PosSakuraSearchEmptyHero() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const petalGradId = `sakura-hero-p-${uid}`;
  const centerGradId = `sakura-hero-c-${uid}`;
  const budGradId = `sakura-hero-b-${uid}`;
  const haloGradId = `sakura-hero-h-${uid}`;
  const badgeGradId = `sakura-hero-bg-${uid}`;

  return (
    <div className={styles.sakuraSearchEmpty}>
      <PosSakuraAmbientField variant="search" />

      <div className={styles.heroContent}>
        <div className={styles.heroSvgWrap} aria-hidden="true">
          <svg viewBox="0 0 224 152" className={styles.heroSvg}>
            <defs>
              <radialGradient id={haloGradId} cx="50%" cy="52%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
                <stop offset="58%" stopColor="#ffe7f2" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#ffd6e7" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={badgeGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
                <stop offset="100%" stopColor="#fff0f6" stopOpacity="0.92" />
              </linearGradient>
              <linearGradient id={petalGradId} x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stopColor="#fff9fc" />
                <stop offset="52%" stopColor="#fbcbe0" />
                <stop offset="100%" stopColor="#e87ca9" />
              </linearGradient>
              <radialGradient id={centerGradId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#cf3d74" stopOpacity="0.68" />
                <stop offset="65%" stopColor="#f472b6" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#fbcfe8" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={budGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffeaf3" />
                <stop offset="55%" stopColor="#f398be" />
                <stop offset="100%" stopColor="#d45586" />
              </linearGradient>
            </defs>

            {/* Soft porcelain-rose aura behind composition */}
            <ellipse cx="112" cy="78" rx="88" ry="64" fill={`url(#${haloGradId})`} />

            {/* Hand-inked Japanese Sakura branch curving organically around the scanner seal */}
            <path
              d="M 22 114 C 52 106, 74 84, 102 62 C 132 39, 162 28, 198 26"
              fill="none"
              stroke="#794155"
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            <path
              d="M 25 113 C 54 105, 75 83, 102 62"
              fill="none"
              stroke="#a86d82"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.65"
            />
            <path
              d="M 66 92 C 54 74, 48 58, 46 42"
              fill="none"
              stroke="#84495e"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            <path
              d="M 148 38 C 164 52, 176 68, 184 86"
              fill="none"
              stroke="#84495e"
              strokeWidth="1.9"
              strokeLinecap="round"
            />

            {/* Unopened spring buds */}
            <SakuraBudGroup budGradId={budGradId} x={46} y={42} rotate={-12} scale={0.84} />
            <SakuraBudGroup budGradId={budGradId} x={198} y={26} rotate={82} scale={0.82} />
            <SakuraBudGroup budGradId={budGradId} x={184} y={86} rotate={154} scale={0.76} />

            {/* Left & top-right blooming Sakura flowers framing the badge */}
            <g className={styles.floatingBlossomGentle}>
              <SakuraBlossomGroup
                petalGradId={petalGradId}
                centerGradId={centerGradId}
                x={54}
                y={96}
                scale={0.96}
                rotate={-16}
              />
            </g>

            {/* Central Rose-Quartz Scanner Medallion */}
            <g transform="translate(80, 44)">
              <rect
                x="0"
                y="0"
                width="64"
                height="64"
                rx="20"
                fill={`url(#${badgeGradId})`}
                stroke="#f09ec0"
                strokeWidth="1.5"
              />
              <rect
                x="4"
                y="4"
                width="56"
                height="56"
                rx="16"
                fill="none"
                stroke="#fbd5e6"
                strokeWidth="1"
                strokeDasharray="3 2.5"
              />
              {/* Scanner viewfinder corners */}
              <path
                d="M 17 24 V 19 A 3 3 0 0 1 20 16 H 25 M 39 16 H 44 A 3 3 0 0 1 47 19 V 24 M 47 40 V 45 A 3 3 0 0 1 44 48 H 39 M 25 48 H 20 A 3 3 0 0 1 17 45 V 40"
                fill="none"
                stroke="#c95080"
                strokeWidth="2.1"
                strokeLinecap="round"
              />
              {/* Crisp barcode bars */}
              <path
                d="M 24 23 V 41 M 28.5 23 V 41 M 32 23 V 41 M 36.5 23 V 41 M 40 23 V 41"
                fill="none"
                stroke="#5c213d"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.82"
              />
              {/* Gentle rose laser scan sweep */}
              <line
                x1="19"
                y1="32"
                x2="45"
                y2="32"
                stroke="#e06393"
                strokeWidth="1.8"
                strokeLinecap="round"
                className={styles.scannerPulseLine}
              />
            </g>

            {/* Foreground hero Sakura blossoms overlapping the top-right & bottom-right edge of the seal */}
            <g className={styles.floatingBlossomGentle}>
              <SakuraBlossomGroup
                petalGradId={petalGradId}
                centerGradId={centerGradId}
                x={152}
                y={40}
                scale={1.06}
                rotate={18}
              />
            </g>
            <SakuraBlossomGroup
              petalGradId={petalGradId}
              centerGradId={centerGradId}
              x={138}
              y={104}
              scale={0.72}
              rotate={32}
            />

            {/* Floating detached wind-swept Sakura petals (well separated, authentic petal silhouette) */}
            <SakuraBreezePetal
              petalGradId={petalGradId}
              x={26}
              y={34}
              rotate={-24}
              scale={0.76}
              variant="a"
            />
            <SakuraBreezePetal
              petalGradId={petalGradId}
              x={22}
              y={84}
              rotate={16}
              scale={0.64}
              variant="b"
            />
            <SakuraBreezePetal
              petalGradId={petalGradId}
              x={194}
              y={58}
              rotate={-32}
              scale={0.72}
              variant="b"
            />
            <SakuraBreezePetal
              petalGradId={petalGradId}
              x={174}
              y={110}
              rotate={24}
              scale={0.66}
              variant="a"
            />
          </svg>
        </div>

        <span className={styles.heroBadgePill}>桜 · Sakura Boutique POS</span>
        <span className={styles.heroTitle}>Una venta empieza aqu&iacute;</span>

        <div className={styles.heroOrnamentRow} aria-hidden="true">
          <span className={styles.heroOrnamentLine} />
          <svg width="13" height="13" viewBox="-28 -28 56 56">
            <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} />
          </svg>
          <span className={styles.heroOrnamentLine} />
        </div>

        <span className={styles.heroSubtitle}>
          Busca por nombre o escanea un c&oacute;digo. Enter agrega una coincidencia exacta; puedes seguir escaneando.
        </span>
      </div>
    </div>
  );
}

/**
 * Botanical empty-cart emblem for "Venta actual" when `cart.length === 0` in `sakura-coquette`.
 */
export function PosSakuraCartEmptyArt() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const petalGradId = `sakura-cart-p-${uid}`;
  const centerGradId = `sakura-cart-c-${uid}`;
  const basketGradId = `sakura-cart-bg-${uid}`;

  return (
    <div className={styles.cartEmptyWrap}>
      <svg viewBox="0 0 140 104" className={styles.cartEmptySvg} aria-hidden="true">
        <defs>
          <linearGradient id={petalGradId} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#fff9fc" />
            <stop offset="52%" stopColor="#fbcbe0" />
            <stop offset="100%" stopColor="#e87ca9" />
          </linearGradient>
          <radialGradient id={centerGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#cf3d74" stopOpacity="0.65" />
            <stop offset="65%" stopColor="#f472b6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fbcfe8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={basketGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffeaf3" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Delicate patisserie basket / cart vessel */}
        <path
          d="M 48 44 C 48 26, 92 26, 92 44"
          fill="none"
          stroke="#c8648e"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M 36 45 H 104 L 96 77 A 8 8 0 0 1 88.2 83 H 51.8 A 8 8 0 0 1 44 77 Z"
          fill={`url(#${basketGradId})`}
          stroke="#e58db2"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M 43 56 H 97 M 46 68 H 94"
          fill="none"
          stroke="#f3b6cf"
          strokeWidth="1.1"
          strokeDasharray="3 2.5"
          strokeLinecap="round"
        />

        {/* Blooming Sakura flower resting on the basket rim */}
        <g className={styles.floatingBlossomGentle}>
          <SakuraBlossomGroup
            petalGradId={petalGradId}
            centerGradId={centerGradId}
            x={96}
            y={42}
            scale={0.78}
            rotate={16}
          />
        </g>
        <SakuraBlossomGroup
          petalGradId={petalGradId}
          centerGradId={centerGradId}
          x={44}
          y={46}
          scale={0.54}
          rotate={-22}
        />

        {/* Floating wind-swept petals above basket */}
        <SakuraBreezePetal
          petalGradId={petalGradId}
          x={68}
          y={20}
          rotate={-18}
          scale={0.68}
          variant="a"
        />
        <SakuraBreezePetal
          petalGradId={petalGradId}
          x={114}
          y={24}
          rotate={24}
          scale={0.56}
          variant="b"
        />
      </svg>

      <span className={styles.cartEmptyTitle}>Carrito vac&iacute;o</span>
      <span className={styles.cartEmptySub}>
        Busca por nombre o escanea productos para armar tu venta
      </span>
    </div>
  );
}

/**
 * Blooming 5-petal Sakura check medallion + cascading branch art for "Venta cobrada" (`PosSaleResult`).
 */
export function PosSakuraCheckMedallion() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const petalGradId = `sakura-chk-p-${uid}`;
  const sealGradId = `sakura-chk-s-${uid}`;

  return (
    <span className={styles.modalCheckSeal} aria-hidden="true">
      <svg viewBox="-28 -28 56 56" className={styles.modalCheckSvg}>
        <defs>
          <linearGradient id={petalGradId} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#fbc7de" />
            <stop offset="100%" stopColor="#e87ea9" />
          </linearGradient>
          <linearGradient id={sealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#df6a96" />
            <stop offset="100%" stopColor="#c9507e" />
          </linearGradient>
        </defs>

        {[0, 72, 144, 216, 288].map(deg => (
          <g key={deg} transform={`rotate(${deg})`}>
            <path
              d="M 0 -2 C -7.2 -7.8, -11.4 -16.2, -7.4 -23.8 C -5.8 -26.6, -2.8 -26.0, 0 -21.2 C 2.8 -26.0, 5.8 -26.6, 7.4 -23.8 C 11.4 -16.2, 7.2 -7.8, 0 -2 Z"
              fill={`url(#${petalGradId})`}
              stroke="#e0749f"
              strokeWidth="0.75"
            />
          </g>
        ))}

        <circle cx="0" cy="0" r="12.5" fill={`url(#${sealGradId})`} stroke="#fff5f9" strokeWidth="1.6" />
        <path
          d="M -5.2 0.3 L -1.6 3.9 L 5.6 -3.6"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function PosSakuraModalHeaderArt() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const petalGradId = `sakura-mhd-p-${uid}`;
  const centerGradId = `sakura-mhd-c-${uid}`;
  const budGradId = `sakura-mhd-b-${uid}`;

  return (
    <svg viewBox="0 0 218 106" className={styles.modalHeaderBranch} aria-hidden="true">
      <defs>
        <linearGradient id={petalGradId} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#fffafd" />
          <stop offset="54%" stopColor="#fbd0e3" />
          <stop offset="100%" stopColor="#ea84ae" />
        </linearGradient>
        <radialGradient id={centerGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#cf3d74" stopOpacity="0.65" />
          <stop offset="65%" stopColor="#f472b6" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#fbcfe8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={budGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffeaf3" />
          <stop offset="55%" stopColor="#f398be" />
          <stop offset="100%" stopColor="#d45586" />
        </linearGradient>
      </defs>

      <g opacity="0.68">
        <path
          d="M 226 8 C 184 14, 148 26, 110 48 C 88 60, 68 64, 46 62"
          fill="none"
          stroke="#80475b"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M 154 25 C 142 46, 134 62, 126 78"
          fill="none"
          stroke="#8b5165"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <SakuraBudGroup budGradId={budGradId} x={46} y={62} rotate={-86} scale={0.72} />
        <SakuraBudGroup budGradId={budGradId} x={126} y={78} rotate={-152} scale={0.68} />
        <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} x={164} y={24} scale={0.86} rotate={12} />
        <SakuraBlossomGroup petalGradId={petalGradId} centerGradId={centerGradId} x={110} y={46} scale={0.72} rotate={-18} />
        <SakuraBreezePetal
          petalGradId={petalGradId}
          x={82}
          y={76}
          rotate={22}
          scale={0.62}
          variant="a"
        />
      </g>
    </svg>
  );
}
