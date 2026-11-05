'use client';

import { useId, type CSSProperties } from 'react';
import styles from './pos-neko-decor.module.css';

export type PosNekoVariant = 'mikan' | 'fernanda';
type AmbientNekoKind = 'michi' | 'paw' | 'yarn' | 'bell' | 'moon';

interface AmbientNekoParticleSpec {
  left: number;
  size: number;
  kind: AmbientNekoKind;
  fallDuration: number;
  fallDelay: number;
  swayDuration: number;
  swayDelay: number;
  swayX: number;
  swayDeg: number;
  driftX: number;
  rockDuration: number;
  alpha: number;
}

const CART_NEKO_PARTICLES: AmbientNekoParticleSpec[] = [
  { left: 6, size: 23, kind: 'michi', fallDuration: 11.8, fallDelay: -1.9, swayDuration: 3.2, swayDelay: -0.6, swayX: 13, swayDeg: 13, driftX: 22, rockDuration: 2.6, alpha: 0.68 },
  { left: 15, size: 16, kind: 'paw', fallDuration: 9.8, fallDelay: -6.4, swayDuration: 2.6, swayDelay: -1.3, swayX: 15, swayDeg: 18, driftX: 28, rockDuration: 2.1, alpha: 0.64 },
  { left: 23, size: 16, kind: 'bell', fallDuration: 8.9, fallDelay: -0.9, swayDuration: 2.4, swayDelay: -0.8, swayX: 12, swayDeg: 16, driftX: 18, rockDuration: 2.0, alpha: 0.62 },
  { left: 30, size: 17, kind: 'yarn', fallDuration: 10.9, fallDelay: -3.8, swayDuration: 2.9, swayDelay: -0.9, swayX: 14, swayDeg: 16, driftX: -18, rockDuration: 2.4, alpha: 0.62 },
  { left: 39, size: 24, kind: 'michi', fallDuration: 12.8, fallDelay: -9.1, swayDuration: 3.5, swayDelay: -2.1, swayX: 14, swayDeg: 11, driftX: 24, rockDuration: 2.8, alpha: 0.66 },
  { left: 47, size: 16, kind: 'moon', fallDuration: 10.4, fallDelay: -5.2, swayDuration: 2.8, swayDelay: -1.4, swayX: 13, swayDeg: 15, driftX: -16, rockDuration: 2.3, alpha: 0.64 },
  { left: 54, size: 16, kind: 'paw', fallDuration: 10.1, fallDelay: -4.8, swayDuration: 2.7, swayDelay: -1.7, swayX: 16, swayDeg: 19, driftX: 20, rockDuration: 2.2, alpha: 0.64 },
  { left: 61, size: 22, kind: 'michi', fallDuration: 13.4, fallDelay: -11.5, swayDuration: 3.6, swayDelay: -1.5, swayX: 13, swayDeg: 11, driftX: 20, rockDuration: 2.9, alpha: 0.64 },
  { left: 68, size: 17, kind: 'bell', fallDuration: 11.4, fallDelay: -10.2, swayDuration: 3.0, swayDelay: -0.4, swayX: 13, swayDeg: 15, driftX: -20, rockDuration: 2.3, alpha: 0.64 },
  { left: 75, size: 16, kind: 'paw', fallDuration: 9.2, fallDelay: -2.6, swayDuration: 2.5, swayDelay: -1.9, swayX: 14, swayDeg: 17, driftX: 24, rockDuration: 2.1, alpha: 0.62 },
  { left: 82, size: 23, kind: 'michi', fallDuration: 12.6, fallDelay: -7.5, swayDuration: 3.4, swayDelay: -1.1, swayX: 12, swayDeg: 12, driftX: -16, rockDuration: 2.7, alpha: 0.66 },
  { left: 88, size: 16, kind: 'moon', fallDuration: 9.6, fallDelay: -8.2, swayDuration: 2.6, swayDelay: -0.5, swayX: 13, swayDeg: 16, driftX: 16, rockDuration: 2.2, alpha: 0.62 },
  { left: 93, size: 16, kind: 'yarn', fallDuration: 10.4, fallDelay: -5.4, swayDuration: 2.8, swayDelay: -2.4, swayX: 14, swayDeg: 16, driftX: -22, rockDuration: 2.4, alpha: 0.62 },
];

const MODAL_NEKO_PARTICLES: AmbientNekoParticleSpec[] = CART_NEKO_PARTICLES.filter(
  (_, idx) => idx % 2 === 0
).map(p => ({
  ...p,
  alpha: Math.round(p.alpha * 0.78 * 100) / 100,
  fallDuration: Math.round(p.fallDuration * 0.85 * 10) / 10,
}));

const AMBIENT_SPARKLES = [
  { left: '14%', top: '16%', size: 5.5, duration: '3.2s', delay: '-0.6s' },
  { left: '28%', top: '62%', size: 4.5, duration: '3.8s', delay: '-1.4s' },
  { left: '42%', top: '38%', size: 5, duration: '4.1s', delay: '-1.9s' },
  { left: '64%', top: '24%', size: 5.5, duration: '3.5s', delay: '-2.5s' },
  { left: '78%', top: '58%', size: 4.5, duration: '4.3s', delay: '-1.1s' },
  { left: '52%', top: '78%', size: 5, duration: '3.7s', delay: '-2.9s' },
  { left: '88%', top: '32%', size: 5, duration: '3.4s', delay: '-0.9s' },
];

/**
 * Reusable Cushioned Toe-Bean Paw Print (`🐾`) centered at (0, 0).
 */
function NekoPawStamp({
  pawGradId,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  floatVariant,
  isFernanda = false,
}: {
  pawGradId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  floatVariant?: 'a' | 'b';
  isFernanda?: boolean;
}) {
  const content = (
    <>
      <circle
        cx="0"
        cy="0"
        r="13.5"
        fill={isFernanda ? '#fff5f7' : '#fffaf3'}
        stroke={isFernanda ? '#f4a3b4' : '#f4b582'}
        strokeWidth="1.15"
      />
      <path
        d="M 0 -0.5 C -4.2 -0.5, -7 2.6, -5.8 6.4 C -5 8.6, -2.3 8.6, 0 7.4 C 2.3 8.6, 5 8.6, 5.8 6.4 C 7 2.6, 4.2 -0.5, 0 -0.5 Z"
        fill={`url(#${pawGradId})`}
      />
      <ellipse cx="-6.6" cy="-2.8" rx="2.3" ry="3.2" transform="rotate(-22 -6.6 -2.8)" fill={`url(#${pawGradId})`} />
      <ellipse cx="-2.4" cy="-5.8" rx="2.3" ry="3.4" transform="rotate(-7 -2.4 -5.8)" fill={`url(#${pawGradId})`} />
      <ellipse cx="2.4" cy="-5.8" rx="2.3" ry="3.4" transform="rotate(7 2.4 -5.8)" fill={`url(#${pawGradId})`} />
      <ellipse cx="6.6" cy="-2.8" rx="2.3" ry="3.2" transform="rotate(22 6.6 -2.8)" fill={`url(#${pawGradId})`} />
    </>
  );

  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      {floatVariant ? (
        <g className={floatVariant === 'a' ? styles.floatingItemA : styles.floatingItemB}>{content}</g>
      ) : (
        content
      )}
    </g>
  );
}

/**
 * Reusable Michi Head centered at (0, 0).
 * Supports both Orange Tabby (`mikan`) and Fernanda's White & Brown Tabby Cat (`fernanda`)
 * with her olive-green eyes, white forehead blaze, and cute brown nose smudge!
 */
function NekoMichiHeadGroup({
  furGradId,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  sleeping = false,
  isFernanda = false,
}: {
  furGradId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  sleeping?: boolean;
  isFernanda?: boolean;
}) {
  if (isFernanda) {
    return (
      <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
        {/* Left & Right Brown-Tabby Cat Ears */}
        <path
          d="M -14 -4 L -16 -17 L -5 -10.5 Z M 14 -4 L 16 -17 L 5 -10.5 Z"
          fill="var(--pos-cat-markings, #4b3b30)"
          stroke="#261c15"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
        <path
          d="M -12.8 -6 L -14 -14 L -6.8 -10 Z M 12.8 -6 L 14 -14 L 6.8 -10 Z"
          fill="var(--pos-cat-inner-ear, #e8a0a8)"
          opacity="0.9"
        />
        {/* Snowy White Head Oval */}
        <ellipse
          cx="0"
          cy="1"
          rx="15"
          ry="12"
          fill="var(--pos-cat-fur, #f8fafc)"
          stroke="#475569"
          strokeWidth="1.1"
        />
        {/* Brown-Tabby Cap over Left & Right Forehead with White Blaze in Center */}
        <path
          d="M -14.8 -0.5 C -14.5 -8.5, -7.5 -11.2, -1.6 -9.8 C -1.2 -5.2, -4.5 -1.2, -9.5 1.2 C -12.5 1.5, -14.5 0.8, -14.8 -0.5 Z"
          fill="var(--pos-cat-markings, #4b3b30)"
        />
        <path
          d="M 14.8 -0.5 C 14.5 -8.5, 7.5 -11.2, 1.6 -9.8 C 1.2 -5.2, 4.5 -1.2, 9.5 1.2 C 12.5 1.5, 14.5 0.8, 14.8 -0.5 Z"
          fill="var(--pos-cat-markings, #4b3b30)"
        />
        {/* Dark mackerel tabby stripes on forehead & tabby cheeks */}
        <path
          d="M -10 -7.5 L -6.5 -4.5 M -12.2 -4.2 L -8.2 -2.2 M 10 -7.5 L 6.5 -4.5 M 12.2 -4.2 L 8.2 -2.2"
          stroke="#1f1610"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        {/* Pure White Muzzle */}
        <ellipse cx="0" cy="4.8" rx="8.8" ry="6.2" fill="var(--pos-cat-muzzle, #ffffff)" />
        {/* Fernanda's Cat's Iconic Brown Smudge on Nose Bridge & Left Whisker Pad! */}
        <path
          d="M -0.8 -1.2 C 1.6 -1.2, 2.8 1.2, 2.2 3.4 C 1.5 4.6, -1.8 4.4, -2.8 3.2 C -3.4 1.8, -2.2 -1.2, -0.8 -1.2 Z"
          fill="var(--pos-cat-markings, #4b3b30)"
          opacity="0.92"
        />
        <circle cx="-3.2" cy="4.4" r="1.2" fill="var(--pos-cat-markings, #4b3b30)" opacity="0.85" />
        <circle cx="2.5" cy="4.2" r="0.95" fill="var(--pos-cat-markings, #4b3b30)" opacity="0.78" />
        {/* Soft rosy cheeks */}
        <ellipse cx="-9.4" cy="3.8" rx="2.5" ry="1.5" fill="#fb7185" opacity="0.48" />
        <ellipse cx="9.4" cy="3.8" rx="2.5" ry="1.5" fill="#fb7185" opacity="0.48" />
        {/* Bright Olive-Green Eyes (or sleeping curves) */}
        {sleeping ? (
          <path
            d="M -8 -0.2 Q -5.8 1.9 -3.6 -0.2 M 3.6 -0.2 Q 5.8 1.9 8 -0.2"
            fill="none"
            stroke="#1f1610"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        ) : (
          <>
            <circle cx="-6" cy="-0.3" r="2.4" fill="var(--pos-cat-eyes, #7d9c3a)" stroke="#1f1610" strokeWidth="0.7" />
            <ellipse cx="-6" cy="-0.3" rx="0.75" ry="1.7" fill="#141413" />
            <circle cx="-6.7" cy="-1" r="0.7" fill="#ffffff" />
            <circle cx="6" cy="-0.3" r="2.4" fill="var(--pos-cat-eyes, #7d9c3a)" stroke="#1f1610" strokeWidth="0.7" />
            <ellipse cx="6" cy="-0.3" rx="0.75" ry="1.7" fill="#141413" />
            <circle cx="5.3" cy="-1" r="0.7" fill="#ffffff" />
          </>
        )}
        {/* Terracotta-Pink Nose & :3 Mouth */}
        <polygon points="0,3.5 -1.8,1.7 1.8,1.7" fill="var(--pos-cat-nose, #c46358)" />
        <path
          d="M -3.4 5.1 Q -1.7 6.9 0 4.9 Q 1.7 6.9 3.4 5.1"
          fill="none"
          stroke="#3b2820"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
        {/* Crisp White Whiskers */}
        <path
          d="M -18.5 1.4 L -11.8 2.3 M -18 4.6 L -11.5 4.3 M 18.5 1.4 L 11.8 2.3 M 18 4.6 L 11.5 4.3"
          stroke="#64748b"
          strokeWidth="0.85"
          strokeLinecap="round"
        />
      </g>
    );
  }

  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      {/* Left & Right Cat Ears */}
      <path
        d="M -14 -4 L -16 -17 L -5 -10.5 Z M 14 -4 L 16 -17 L 5 -10.5 Z"
        fill={`url(#${furGradId})`}
        stroke="#9a3e0e"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M -12.8 -6 L -14 -14 L -6.8 -10 Z M 12.8 -6 L 14 -14 L 6.8 -10 Z" fill="#fda4af" opacity="0.88" />
      {/* Head oval */}
      <ellipse cx="0" cy="1" rx="15" ry="12" fill={`url(#${furGradId})`} stroke="#9a3e0e" strokeWidth="1.15" />
      {/* Forehead M tabby stripes & cheek stripes */}
      <path
        d="M -3.6 -9 L -2.2 -5 M 0 -9.6 L 0 -5.2 M 3.6 -9 L 2.2 -5"
        stroke="#b44d12"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M -13.5 -0.5 L -10.2 0.2 M -13.2 2.4 L -10 2.6 M 13.5 -0.5 L 10.2 0.2 M 13.2 2.4 L 10 2.6"
        stroke="#b44d12"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      {/* Cream muzzle & rosy cheeks */}
      <ellipse cx="0" cy="4.6" rx="8.4" ry="6" fill="#fffaf3" />
      <ellipse cx="-9.2" cy="3.6" rx="2.6" ry="1.6" fill="#fb7185" opacity="0.58" />
      <ellipse cx="9.2" cy="3.6" rx="2.6" ry="1.6" fill="#fb7185" opacity="0.58" />
      {/* Eyes */}
      {sleeping ? (
        <path
          d="M -7.8 -0.2 Q -5.8 1.8 -3.8 -0.2 M 3.8 -0.2 Q 5.8 1.8 7.8 -0.2"
          fill="none"
          stroke="#431407"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      ) : (
        <>
          <circle cx="-6" cy="-0.2" r="2" fill="#361605" />
          <circle cx="-6.6" cy="-0.8" r="0.65" fill="#ffffff" />
          <circle cx="6" cy="-0.2" r="2" fill="#361605" />
          <circle cx="5.4" cy="-0.8" r="0.65" fill="#ffffff" />
        </>
      )}
      {/* Pink nose & :3 kitty mouth */}
      <polygon points="0,3.2 -1.7,1.5 1.7,1.5" fill="#f43f5e" />
      <path
        d="M -3.4 4.8 Q -1.7 6.8 0 4.7 Q 1.7 6.8 3.4 4.8"
        fill="none"
        stroke="#522810"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Whiskers */}
      <path
        d="M -18.5 1.2 L -12 2.2 M -18 4.5 L -11.8 4.2 M 18.5 1.2 L 12 2.2 M 18 4.5 L 11.8 4.2"
        stroke="#7c3a16"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </g>
  );
}

function AmbientNekoGlyphSvg({
  kind,
  furGradId,
  pawGradId,
  yarnGradId,
  bellGradId,
  rockStyle,
  isFernanda,
}: {
  kind: AmbientNekoKind;
  furGradId: string;
  pawGradId: string;
  yarnGradId: string;
  bellGradId: string;
  rockStyle: CSSProperties;
  isFernanda: boolean;
}) {
  if (kind === 'michi') {
    return (
      <svg viewBox="-22 -20 44 38" className={styles.ambientRockGlyph} style={rockStyle}>
        <NekoMichiHeadGroup furGradId={furGradId} isFernanda={isFernanda} />
      </svg>
    );
  }

  if (kind === 'moon') {
    return (
      <svg viewBox="0 0 32 32" className={styles.ambientRockGlyph} style={rockStyle}>
        <path
          d="M 21 4 C 13.5 4.4, 8 10.5, 8 18 C 8 24.5, 13 28.5, 19.5 27.5 C 14.2 25.8, 12.2 21, 13 15.5 C 13.8 10.5, 17.2 6.5, 21 4 Z"
          fill={`url(#${bellGradId})`}
          stroke="#a16207"
          strokeWidth="1"
        />
        <path
          d="M 23.5 9.5 L 24.6 12.4 L 27.5 13.5 L 24.6 14.6 L 23.5 17.5 L 22.4 14.6 L 19.5 13.5 L 22.4 12.4 Z"
          fill={isFernanda ? '#f43f5e' : '#fb923c'}
          stroke="#fef9c3"
          strokeWidth="0.6"
        />
      </svg>
    );
  }

  if (kind === 'yarn') {
    return (
      <svg viewBox="0 0 36 36" className={styles.ambientRockGlyph} style={rockStyle}>
        <circle
          cx="17"
          cy="17"
          r="12"
          fill={`url(#${yarnGradId})`}
          stroke={isFernanda ? '#881337' : '#b44d12'}
          strokeWidth="1"
        />
        <path
          d="M 7 12 Q 17 6 27 13 M 6 17 Q 17 11 28 18 M 8 22 Q 17 16 26 23 M 13 6 Q 21 17 14 28"
          fill="none"
          stroke={isFernanda ? '#881337' : '#9a3412'}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.65"
        />
        <path
          d="M 26 24 C 30 27, 33 24, 33 29"
          fill="none"
          stroke={isFernanda ? '#e11d48' : '#ea580c'}
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'bell') {
    return (
      <svg viewBox="0 0 32 32" className={styles.ambientRockGlyph} style={rockStyle}>
        <circle cx="16" cy="6" r="2.6" fill="none" stroke="#ca8a04" strokeWidth="1.5" />
        <circle cx="16" cy="17" r="9.5" fill={`url(#${bellGradId})`} stroke="#a16207" strokeWidth="1" />
        <path d="M 7 16 H 25" stroke="#a16207" strokeWidth="1.1" />
        <circle cx="16" cy="20.6" r="2" fill="#713f12" />
        <line x1="16" y1="22.2" x2="16" y2="26.2" stroke="#713f12" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="-16 -16 32 32" className={styles.ambientRockGlyph} style={rockStyle}>
      <NekoPawStamp pawGradId={pawGradId} isFernanda={isFernanda} />
    </svg>
  );
}

/**
 * Continuous, silky-smooth Neko ambient particle layer + corner michi watermarks.
 * Supports both `nekoVariant="mikan"` (Gato Naranja) and `nekoVariant="fernanda"` (Michi de Fernanda).
 */
export function PosNekoAmbientField({
  variant = 'cart',
  nekoVariant = 'mikan',
}: {
  variant?: 'cart' | 'search' | 'modal';
  nekoVariant?: PosNekoVariant;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const furGradId = `neko-amb-f-${uid}`;
  const pawGradId = `neko-amb-p-${uid}`;
  const yarnGradId = `neko-amb-y-${uid}`;
  const bellGradId = `neko-amb-b-${uid}`;
  const isFernanda = nekoVariant === 'fernanda';

  const particles = variant === 'modal' ? MODAL_NEKO_PARTICLES : CART_NEKO_PARTICLES;
  const fallDist = variant === 'modal' ? '340px' : '680px';

  return (
    <div className={styles.ambientField} aria-hidden="true">
      <svg className={styles.defsSvg} aria-hidden="true">
        <defs>
          <linearGradient id={furGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isFernanda ? '#ffffff' : '#ffedd5'} />
            <stop offset="48%" stopColor={isFernanda ? '#f1f5f9' : '#fdba74'} />
            <stop offset="100%" stopColor={isFernanda ? '#cbd5e1' : '#ea580c'} />
          </linearGradient>
          <linearGradient id={pawGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fda4af" />
            <stop offset="100%" stopColor={isFernanda ? '#e11d48' : '#ea580c'} />
          </linearGradient>
          <radialGradient id={yarnGradId} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor={isFernanda ? '#fecdd3' : '#fed7aa'} />
            <stop offset="55%" stopColor={isFernanda ? '#f43f5e' : '#fb923c'} />
            <stop offset="100%" stopColor={isFernanda ? '#9f1239' : '#c2410c'} />
          </radialGradient>
          <radialGradient id={bellGradId} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ca8a04" />
          </radialGradient>
        </defs>
      </svg>

      {/* Top-right sleeping cat & paw prints watermark */}
      <svg
        viewBox="0 0 210 135"
        className={`${styles.cornerNeko} ${variant === 'modal' ? styles.cornerNekoModal : ''}`}
      >
        {isFernanda && (
          /* Glowing crescent moon & stars behind sleeping Fernanda's cat */
          <path
            d="M 192 12 C 178 13, 168 24, 168 38 C 168 50, 178 58, 190 56 C 180 53, 176 44, 178 33 C 179 23, 185 16, 192 12 Z"
            fill={`url(#${bellGradId})`}
            opacity="0.85"
          />
        )}
        {/* Curled sleeping cat body */}
        <ellipse
          cx="154"
          cy="44"
          rx="28"
          ry="19"
          fill={isFernanda ? 'var(--pos-cat-fur, #f8fafc)' : `url(#${furGradId})`}
          stroke={isFernanda ? '#475569' : '#9a3e0e'}
          strokeWidth="1.3"
        />
        {/* Tabby patch / stripes on back */}
        {isFernanda ? (
          <>
            <path
              d="M 148 26 C 164 25, 178 32, 180 44 C 170 46, 156 42, 148 26 Z"
              fill="var(--pos-cat-markings, #4b3b30)"
            />
            <path
              d="M 156 27 Q 162 35 157 42 M 166 29 Q 171 37 166 44"
              fill="none"
              stroke="#1f1610"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="M 156 24 Q 162 34 156 42 M 166 26 Q 172 36 165 44 M 175 31 Q 179 39 173 47"
            fill="none"
            stroke="#b44d12"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        )}
        {/* Curled striped tail */}
        <path
          d="M 178 50 C 192 58, 184 74, 162 70 C 148 67, 142 60, 146 55"
          fill="none"
          stroke={isFernanda ? 'var(--pos-cat-markings, #4b3b30)' : '#ea580c'}
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <path
          d="M 178 50 C 192 58, 184 74, 162 70"
          fill="none"
          stroke={isFernanda ? '#1f1610' : '#9a3e0e'}
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeDasharray="4 6"
        />
        <NekoMichiHeadGroup furGradId={furGradId} x={132} y={44} rotate={-10} scale={0.95} sleeping isFernanda={isFernanda} />
        <NekoPawStamp pawGradId={pawGradId} x={86} y={32} rotate={-24} scale={0.68} isFernanda={isFernanda} />
        <NekoPawStamp pawGradId={pawGradId} x={106} y={76} rotate={18} scale={0.58} isFernanda={isFernanda} />
      </svg>

      {/* Bottom-left paw trail watermark */}
      {variant !== 'modal' && (
        <svg viewBox="0 0 170 112" className={styles.bottomPawTrail}>
          <NekoPawStamp pawGradId={pawGradId} x={28} y={82} rotate={24} scale={0.74} isFernanda={isFernanda} />
          <NekoPawStamp pawGradId={pawGradId} x={64} y={64} rotate={32} scale={0.64} isFernanda={isFernanda} />
          <NekoPawStamp pawGradId={pawGradId} x={98} y={84} rotate={18} scale={0.56} isFernanda={isFernanda} />
        </svg>
      )}

      {/* Ambient sparkles */}
      {AMBIENT_SPARKLES.map((d, idx) => (
        <span
          key={idx}
          className={`${styles.ambientSparkle} ${isFernanda ? styles.ambientSparkleFernanda : ''}`}
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

      {/* Continuous, silky-smooth floating Michi heads, Paws, Yarn, Moons & Bells */}
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
        };

        const rockStyle: CSSProperties = {
          animationDuration: `${p.rockDuration}s`,
          animationDelay: `${p.swayDelay}s`,
          ['--sway-deg' as string]: `${p.swayDeg}deg`,
        };

        return (
          <span key={idx} className={styles.ambientFallTrack} style={fallStyle}>
            <span className={styles.ambientSwayTrack} style={swayStyle}>
              <AmbientNekoGlyphSvg
                kind={p.kind}
                furGradId={furGradId}
                pawGradId={pawGradId}
                yarnGradId={yarnGradId}
                bellGradId={bellGradId}
                rockStyle={rockStyle}
                isFernanda={isFernanda}
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Bespoke Cat centerpiece for "Una venta empieza aquí".
 * Supports both `nekoVariant="mikan"` (Michi Naranja) and `nekoVariant="fernanda"` (Michi de Fernanda with real photo cameo!).
 */
export function PosNekoSearchEmptyHero({
  nekoVariant = 'mikan',
}: {
  nekoVariant?: PosNekoVariant;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const furGradId = `neko-hero-f-${uid}`;
  const pawGradId = `neko-hero-p-${uid}`;
  const yarnGradId = `neko-hero-y-${uid}`;
  const haloGradId = `neko-hero-h-${uid}`;
  const badgeGradId = `neko-hero-bg-${uid}`;
  const isFernanda = nekoVariant === 'fernanda';

  return (
    <div className={styles.nekoSearchEmpty}>
      <PosNekoAmbientField variant="search" nekoVariant={nekoVariant} />

      <div className={styles.heroContent}>
        <div className={styles.heroSvgWrap} aria-hidden="true">
          {/* If Fernanda's theme is active, display a floating starlight cameo of Fernanda's real cat photo! */}
          {isFernanda && (
            <div className={styles.fernandaPhotoCameo} title="Michi real de Fernanda">
              <img
                src="/pos/wallpapers/neko-fernanda.jpg"
                alt="Michi de Fernanda"
                className={styles.fernandaPhotoImg}
              />
              <span className={styles.fernandaPhotoTag}>🐾 Fernanda</span>
            </div>
          )}

          <svg viewBox="0 0 248 168" className={styles.heroSvg}>
            <defs>
              <radialGradient id={haloGradId} cx="50%" cy="52%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
                <stop offset="58%" stopColor={isFernanda ? '#ffe4e6' : '#ffedd5'} stopOpacity="0.72" />
                <stop offset="100%" stopColor={isFernanda ? '#e2e8f0' : '#fed7aa'} stopOpacity="0" />
              </radialGradient>
              <linearGradient id={badgeGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="100%" stopColor={isFernanda ? '#fff1f2' : '#fff7ed'} stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id={furGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffedd5" />
                <stop offset="46%" stopColor="#fdba74" />
                <stop offset="100%" stopColor="#ea580c" />
              </linearGradient>
              <linearGradient id={pawGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fda4af" />
                <stop offset="100%" stopColor={isFernanda ? '#e11d48' : '#ea580c'} />
              </linearGradient>
              <radialGradient id={yarnGradId} cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor={isFernanda ? '#fecdd3' : '#fed7aa'} />
                <stop offset="55%" stopColor={isFernanda ? '#f43f5e' : '#fb923c'} />
                <stop offset="100%" stopColor={isFernanda ? '#9f1239' : '#c2410c'} />
              </radialGradient>
            </defs>

            {/* Aura behind composition */}
            <ellipse cx="124" cy="86" rx="98" ry="68" fill={`url(#${haloGradId})`} />

            {/* Glowing Golden Crescent Moon in upper-left for Fernanda's Neko Nocturno */}
            {isFernanda && (
              <g transform="translate(26, 26)" className={styles.floatingItemB}>
                <path
                  d="M 18 2 C 9.5 2.5, 3.5 9.5, 3.5 18 C 3.5 25.5, 9.2 30, 16.5 29 C 10.5 27, 8.2 21.5, 9 15 C 9.8 9.2, 13.8 4.8, 18 2 Z"
                  fill="#facc15"
                  stroke="#a16207"
                  strokeWidth="1"
                />
                <path
                  d="M 21 8 L 22.2 11.2 L 25.4 12.4 L 22.2 13.6 L 21 16.8 L 19.8 13.6 L 16.6 12.4 L 19.8 11.2 Z"
                  fill="#e11d48"
                  stroke="#fef9c3"
                  strokeWidth="0.6"
                />
              </g>
            )}

            {/* Wagging striped tail curving out from behind the scanner */}
            <g transform="translate(148, 102)">
              <g className={styles.waggingTail}>
                <path
                  d="M 0 0 C 22 4, 42 -8, 48 -28 C 51 -38, 42 -42, 36 -34"
                  fill="none"
                  stroke={isFernanda ? 'var(--pos-cat-markings, #4b3b30)' : '#ea580c'}
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M 4 0 C 24 3, 42 -8, 48 -28"
                  fill="none"
                  stroke={isFernanda ? '#1f1610' : '#9a3e0e'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="4 6"
                />
              </g>
            </g>

            {/* Central Cat-Eared Scanner Medallion */}
            <g transform="translate(92, 50)">
              {/* Cat ears on top of the scanner badge */}
              <path
                d="M 8 4 L 4 -11 L 21 0 Z M 56 4 L 60 -11 L 43 0 Z"
                fill={isFernanda ? 'var(--pos-cat-markings, #4b3b30)' : `url(#${furGradId})`}
                stroke={isFernanda ? '#261c15' : '#d96b27'}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M 10 2 L 7 -7 L 18 0 Z M 54 2 L 57 -7 L 46 0 Z" fill="#fda4af" opacity="0.88" />

              <rect
                x="0"
                y="0"
                width="64"
                height="64"
                rx="20"
                fill={`url(#${badgeGradId})`}
                stroke={isFernanda ? '#e11d48' : '#f29d5c'}
                strokeWidth="1.65"
              />
              <rect
                x="4"
                y="4"
                width="56"
                height="56"
                rx="16"
                fill="none"
                stroke={isFernanda ? '#fda4af' : '#fed7aa'}
                strokeWidth="1.15"
                strokeDasharray="3 2.5"
              />
              {/* Scanner viewfinder corners */}
              <path
                d="M 17 24 V 19 A 3 3 0 0 1 20 16 H 25 M 39 16 H 44 A 3 3 0 0 1 47 19 V 24 M 47 40 V 45 A 3 3 0 0 1 44 48 H 39 M 25 48 H 20 A 3 3 0 0 1 17 45 V 40"
                fill="none"
                stroke={isFernanda ? '#be123c' : '#d9661f'}
                strokeWidth="2.1"
                strokeLinecap="round"
              />
              {/* Crisp barcode bars */}
              <path
                d="M 24 23 V 41 M 28.5 23 V 41 M 32 23 V 41 M 36.5 23 V 41 M 40 23 V 41"
                fill="none"
                stroke={isFernanda ? '#0f172a' : '#522810'}
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.84"
              />
              {/* Laser scan sweep */}
              <line
                x1="19"
                y1="32"
                x2="45"
                y2="32"
                stroke={isFernanda ? '#e11d48' : '#ea580c'}
                strokeWidth="2"
                strokeLinecap="round"
                className={styles.scannerPulseLine}
              />
            </g>

            {/* Left Hero Cat sitting & leaning cheerfully beside the scanner */}
            <g transform="translate(60, 98)">
              <g className={styles.michiBreathe}>
                {/* Plump cat body */}
                <ellipse
                  cx="0"
                  cy="14"
                  rx="16.5"
                  ry="18.5"
                  fill={isFernanda ? 'var(--pos-cat-fur, #f8fafc)' : `url(#${furGradId})`}
                  stroke={isFernanda ? '#475569' : '#9a3e0e'}
                  strokeWidth="1.2"
                />
                {/* Snowy white chest */}
                <ellipse cx="1.5" cy="16" rx="10.5" ry="13" fill="#ffffff" />
                {/* Side tabby patch / stripes */}
                {isFernanda ? (
                  <>
                    <path
                      d="M -16 6 C -11 5, -8 12, -10 22 C -14 20, -16.5 14, -16 6 Z"
                      fill="var(--pos-cat-markings, #4b3b30)"
                    />
                    <path
                      d="M -14 9 Q -10 10 -8 12 M -15 15 Q -10 16 -9 18"
                      fill="none"
                      stroke="#1f1610"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </>
                ) : (
                  <path
                    d="M -14 8 Q -8 9 -6 11 M -15 14 Q -8 15 -6 17 M -14 20 Q -8 21 -7 23"
                    fill="none"
                    stroke="#b44d12"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                )}
                {/* Cherry-red collar + golden suzu bell */}
                <path
                  d="M -11.5 1 Q 0 6.5 11.5 1"
                  fill="none"
                  stroke="var(--pos-cat-collar, #c92343)"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                />
                <circle cx="1" cy="5.8" r="4" fill="#facc15" stroke="#a16207" strokeWidth="0.9" />
                <circle cx="1" cy="6.8" r="1.05" fill="#713f12" />
                {/* Cute white front paws */}
                <ellipse
                  cx="-7"
                  cy="30.5"
                  rx="5.4"
                  ry="3.8"
                  fill="#ffffff"
                  stroke={isFernanda ? '#475569' : '#9a3e0e'}
                  strokeWidth="1.1"
                />
                <ellipse
                  cx="7"
                  cy="30.5"
                  rx="5.4"
                  ry="3.8"
                  fill="#ffffff"
                  stroke={isFernanda ? '#475569' : '#9a3e0e'}
                  strokeWidth="1.1"
                />
                {/* Michi head (Fernanda's cat or Orange Tabby) */}
                <NekoMichiHeadGroup
                  furGradId={furGradId}
                  x={0}
                  y={-10}
                  rotate={-7}
                  scale={1.16}
                  isFernanda={isFernanda}
                />
              </g>
            </g>

            {/* Top-Right Sleeping Kitten when Mikan (Fernanda has real photo cameo at top-right) */}
            {!isFernanda && (
              <g transform="translate(178, 42)">
                <g className={styles.floatingItemB}>
                  <NekoMichiHeadGroup furGradId={furGradId} x={0} y={0} rotate={14} scale={0.78} sleeping />
                </g>
              </g>
            )}

            {/* Playful Yarn Ball on bottom-right */}
            <g transform="translate(166, 118)">
              <g className={styles.floatingItemA}>
                <circle
                  cx="0"
                  cy="0"
                  r="12"
                  fill={`url(#${yarnGradId})`}
                  stroke={isFernanda ? '#881337' : '#b44d12'}
                  strokeWidth="1.1"
                />
                <path
                  d="M -8 -4 Q 0 -9 8 -3 M -9 1 Q 0 -4 9 2 M -7 6 Q 0 1 7 7"
                  fill="none"
                  stroke={isFernanda ? '#881337' : '#9a3412'}
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M 9 7 C 16 11, 22 6, 26 12"
                  fill="none"
                  stroke={isFernanda ? '#e11d48' : '#ea580c'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </g>
            </g>

            {/* Well-separated floating toe-bean paw stamps */}
            <NekoPawStamp pawGradId={pawGradId} x={24} y={66} rotate={-22} scale={0.72} floatVariant="a" isFernanda={isFernanda} />
            <NekoPawStamp pawGradId={pawGradId} x={124} y={18} rotate={15} scale={0.62} floatVariant="b" isFernanda={isFernanda} />
            <NekoPawStamp pawGradId={pawGradId} x={212} y={88} rotate={26} scale={0.68} floatVariant="a" isFernanda={isFernanda} />
          </svg>
        </div>

        <span className={`${styles.heroBadgePill} ${isFernanda ? styles.heroBadgePillFernanda : ''}`}>
          {isFernanda ? '🌙 · Michi de Fernanda · Neko Nocturno' : '🐾 · Michi Naranja Café POS'}
        </span>
        <span className={`${styles.heroTitle} ${isFernanda ? styles.heroTitleFernanda : ''}`}>
          Una venta empieza aqu&iacute;
        </span>

        <div className={styles.heroOrnamentRow} aria-hidden="true">
          <span className={`${styles.heroOrnamentLine} ${isFernanda ? styles.heroOrnamentLineFernanda : ''}`} />
          <svg width="15" height="15" viewBox="-16 -16 32 32">
            <NekoPawStamp pawGradId={pawGradId} isFernanda={isFernanda} />
          </svg>
          <span className={`${styles.heroOrnamentLine} ${isFernanda ? styles.heroOrnamentLineFernanda : ''}`} />
        </div>

        <span className={`${styles.heroSubtitle} ${isFernanda ? styles.heroSubtitleFernanda : ''}`}>
          {isFernanda
            ? 'El michi blanco y atigrado de Fernanda cuida tu caja. Busca por nombre o escanea un código para vender.'
            : 'Busca por nombre o escanea un código. Enter agrega una coincidencia exacta; puedes seguir escaneando.'}
        </span>
      </div>
    </div>
  );
}

/**
 * Adorable Kitten peeking out of a shopping basket for empty "Venta actual".
 * Supports both `nekoVariant="mikan"` and `nekoVariant="fernanda"`.
 */
export function PosNekoCartEmptyArt({
  nekoVariant = 'mikan',
}: {
  nekoVariant?: PosNekoVariant;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const furGradId = `neko-cart-f-${uid}`;
  const pawGradId = `neko-cart-p-${uid}`;
  const basketGradId = `neko-cart-bg-${uid}`;
  const isFernanda = nekoVariant === 'fernanda';

  return (
    <div className={styles.cartEmptyWrap}>
      <svg viewBox="0 0 156 116" className={styles.cartEmptySvg} aria-hidden="true">
        <defs>
          <linearGradient id={furGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffedd5" />
            <stop offset="48%" stopColor="#fdba74" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
          <linearGradient id={pawGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fda4af" />
            <stop offset="100%" stopColor={isFernanda ? '#e11d48' : '#ea580c'} />
          </linearGradient>
          <linearGradient id={basketGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.97" />
            <stop offset="100%" stopColor={isFernanda ? '#ffe4e6' : '#ffedd5'} stopOpacity="0.93" />
          </linearGradient>
        </defs>

        {/* Golden Crescent Moon floating on top-right for Fernanda */}
        {isFernanda && (
          <g transform="translate(116, 14)" className={styles.floatingItemB}>
            <path
              d="M 14 2 C 7.5 2.4, 3 7.8, 3 14.2 C 3 19.8, 7.2 23.2, 12.8 22.4 C 8.2 20.8, 6.5 16.8, 7.2 11.8 C 7.8 7.4, 10.8 4, 14 2 Z"
              fill="#facc15"
              stroke="#a16207"
              strokeWidth="0.9"
            />
          </g>
        )}

        {/* Wagging striped tail peeking from behind basket */}
        <g transform="translate(104, 72)">
          <g className={styles.waggingTail}>
            <path
              d="M 0 0 C 16 -2, 26 -14, 24 -26"
              fill="none"
              stroke={isFernanda ? 'var(--pos-cat-markings, #4b3b30)' : '#ea580c'}
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 2 -1 C 16 -3, 25 -14, 24 -26"
              fill="none"
              stroke={isFernanda ? '#1f1610' : '#9a3e0e'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="3.5 5"
            />
          </g>
        </g>

        {/* Kitten peeking out of the basket */}
        <g className={styles.michiBreathe}>
          <NekoMichiHeadGroup furGradId={furGradId} x={78} y={40} rotate={-4} scale={1.04} isFernanda={isFernanda} />
        </g>

        {/* Patisserie / Starlight Basket */}
        <path
          d="M 42 54 H 114 L 105 88 A 8 8 0 0 1 97.2 94 H 58.8 A 8 8 0 0 1 51 88 Z"
          fill={`url(#${basketGradId})`}
          stroke={isFernanda ? '#e11d48' : '#e68843'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M 49 66 H 107 M 52 78 H 104"
          fill="none"
          stroke={isFernanda ? '#fda4af' : '#f5b886'}
          strokeWidth="1.2"
          strokeDasharray="3 2.5"
          strokeLinecap="round"
        />

        {/* Golden suzu bell emblem in center of basket for Fernanda */}
        {isFernanda && (
          <g transform="translate(78, 73)">
            <circle cx="0" cy="0" r="6" fill="#facc15" stroke="#a16207" strokeWidth="0.9" />
            <line x1="-5.5" y1="-0.5" x2="5.5" y2="-0.5" stroke="#a16207" strokeWidth="0.9" />
            <circle cx="0" cy="2" r="1.4" fill="#713f12" />
          </g>
        )}

        {/* Little white kitty paws resting on the basket rim */}
        <ellipse
          cx="62"
          cy="54"
          rx="5.6"
          ry="3.9"
          fill="#ffffff"
          stroke={isFernanda ? '#475569' : '#9a3e0e'}
          strokeWidth="1.1"
        />
        <ellipse
          cx="94"
          cy="54"
          rx="5.6"
          ry="3.9"
          fill="#ffffff"
          stroke={isFernanda ? '#475569' : '#9a3e0e'}
          strokeWidth="1.1"
        />

        {/* Floating paw stamp */}
        <NekoPawStamp pawGradId={pawGradId} x={30} y={34} rotate={-22} scale={0.64} floatVariant="a" isFernanda={isFernanda} />
      </svg>

      <span className={`${styles.cartEmptyTitle} ${isFernanda ? styles.cartEmptyTitleFernanda : ''}`}>
        {isFernanda ? 'El michi de Fernanda espera tu venta' : 'Carrito vacío'}
      </span>
      <span className={`${styles.cartEmptySub} ${isFernanda ? styles.cartEmptySubFernanda : ''}`}>
        {isFernanda
          ? 'Busca por nombre o escanea productos para llenar el carrito'
          : 'Busca por nombre o escanea productos para alimentar al michi'}
      </span>
    </div>
  );
}

/**
 * Cat-eared check medallion + purring cat header art for "Venta cobrada" (`PosSaleResult`).
 */
export function PosNekoCheckMedallion({
  nekoVariant = 'mikan',
}: {
  nekoVariant?: PosNekoVariant;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const furGradId = `neko-chk-f-${uid}`;
  const sealGradId = `neko-chk-s-${uid}`;
  const isFernanda = nekoVariant === 'fernanda';

  return (
    <span className={styles.modalCheckSeal} aria-hidden="true">
      <svg viewBox="-28 -28 56 56" className={styles.modalCheckSvg}>
        <defs>
          <linearGradient id={furGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor={isFernanda ? '#ffe4e6' : '#fdba74'} />
            <stop offset="100%" stopColor={isFernanda ? '#fda4af' : '#ea580c'} />
          </linearGradient>
          <linearGradient id={sealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isFernanda ? '#e11d48' : '#ed893e'} />
            <stop offset="100%" stopColor={isFernanda ? '#9f1239' : '#d4651d'} />
          </linearGradient>
        </defs>

        {/* Cat ears on top of the check seal */}
        <path
          d="M -18 -8 L -21 -24 L -6 -16 Z M 18 -8 L 21 -24 L 6 -16 Z"
          fill={isFernanda ? '#4b3b30' : `url(#${furGradId})`}
          stroke={isFernanda ? '#261c15' : '#c25616'}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M -16 -10 L -18 -20 L -8 -15 Z M 16 -10 L 18 -20 L 8 -15 Z" fill="#fda4af" opacity="0.88" />

        <circle
          cx="0"
          cy="2"
          r="19"
          fill={`url(#${furGradId})`}
          stroke={isFernanda ? '#e11d48' : '#d96b27'}
          strokeWidth="1.2"
        />
        <circle cx="0" cy="2" r="13.5" fill={`url(#${sealGradId})`} stroke="#fffaf5" strokeWidth="1.8" />
        <path
          d="M -5.4 2.2 L -1.6 6 L 5.8 -1.8"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function PosNekoModalHeaderArt({
  nekoVariant = 'mikan',
}: {
  nekoVariant?: PosNekoVariant;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const furGradId = `neko-mhd-f-${uid}`;
  const pawGradId = `neko-mhd-p-${uid}`;
  const isFernanda = nekoVariant === 'fernanda';

  return (
    <svg viewBox="0 0 220 106" className={styles.modalHeaderNeko} aria-hidden="true">
      <defs>
        <linearGradient id={furGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffedd5" />
          <stop offset="48%" stopColor="#fdba74" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id={pawGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="100%" stopColor={isFernanda ? '#e11d48' : '#ea580c'} />
        </linearGradient>
      </defs>

      <g opacity="0.76">
        <NekoMichiHeadGroup furGradId={furGradId} x={156} y={36} rotate={-10} scale={0.95} sleeping isFernanda={isFernanda} />
        <NekoPawStamp pawGradId={pawGradId} x={112} y={28} rotate={-22} scale={0.62} isFernanda={isFernanda} />
        <NekoPawStamp pawGradId={pawGradId} x={88} y={66} rotate={18} scale={0.56} floatVariant="a" isFernanda={isFernanda} />
      </g>
    </svg>
  );
}
