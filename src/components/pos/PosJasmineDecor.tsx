'use client';

import { useId, type CSSProperties } from 'react';
import styles from './pos-jasmine-decor.module.css';

type AmbientJasmineKind = 'jasmine_princess' | 'lamp' | 'gem' | 'blossom' | 'lantern';

interface AmbientJasmineParticleSpec {
  left: number;
  size: number;
  kind: AmbientJasmineKind;
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

const CART_JASMINE_PARTICLES: AmbientJasmineParticleSpec[] = [
  { left: 6, size: 24, kind: 'jasmine_princess', fallDuration: 12.6, fallDelay: -1.8, swayDuration: 3.3, swayDelay: -0.6, swayX: 13, swayDeg: 11, driftX: 20, rockDuration: 2.7, alpha: 0.62 },
  { left: 16, size: 22, kind: 'lamp', fallDuration: 10.4, fallDelay: -6.2, swayDuration: 2.8, swayDelay: -1.3, swayX: 15, swayDeg: 15, driftX: 24, rockDuration: 2.3, alpha: 0.64 },
  { left: 26, size: 17, kind: 'gem', fallDuration: 11.1, fallDelay: -3.5, swayDuration: 2.9, swayDelay: -0.9, swayX: 14, swayDeg: 16, driftX: -18, rockDuration: 2.4, alpha: 0.6 },
  { left: 36, size: 18, kind: 'blossom', fallDuration: 9.8, fallDelay: -8.4, swayDuration: 2.6, swayDelay: -2.0, swayX: 14, swayDeg: 20, driftX: 22, rockDuration: 2.2, alpha: 0.62 },
  { left: 46, size: 20, kind: 'lantern', fallDuration: 11.8, fallDelay: -4.9, swayDuration: 3.1, swayDelay: -1.5, swayX: 12, swayDeg: 12, driftX: -16, rockDuration: 2.5, alpha: 0.58 },
  { left: 56, size: 23, kind: 'lamp', fallDuration: 10.9, fallDelay: -10.1, swayDuration: 2.9, swayDelay: -0.4, swayX: 14, swayDeg: 14, driftX: 20, rockDuration: 2.3, alpha: 0.62 },
  { left: 66, size: 17, kind: 'gem', fallDuration: 9.5, fallDelay: -2.7, swayDuration: 2.5, swayDelay: -1.8, swayX: 13, swayDeg: 17, driftX: -22, rockDuration: 2.1, alpha: 0.6 },
  { left: 75, size: 24, kind: 'jasmine_princess', fallDuration: 13.2, fallDelay: -7.6, swayDuration: 3.5, swayDelay: -1.1, swayX: 12, swayDeg: 10, driftX: -18, rockDuration: 2.8, alpha: 0.6 },
  { left: 84, size: 18, kind: 'blossom', fallDuration: 10.2, fallDelay: -5.3, swayDuration: 2.7, swayDelay: -2.3, swayX: 14, swayDeg: 18, driftX: 18, rockDuration: 2.3, alpha: 0.6 },
  { left: 92, size: 19, kind: 'lantern', fallDuration: 11.4, fallDelay: -1.1, swayDuration: 3.0, swayDelay: -0.8, swayX: 12, swayDeg: 13, driftX: -16, rockDuration: 2.4, alpha: 0.56 },
  { left: 21, size: 17, kind: 'blossom', fallDuration: 9.2, fallDelay: -9.4, swayDuration: 2.5, swayDelay: -1.4, swayX: 13, swayDeg: 19, driftX: 16, rockDuration: 2.1, alpha: 0.56 },
  { left: 61, size: 16, kind: 'gem', fallDuration: 10.6, fallDelay: -6.8, swayDuration: 2.8, swayDelay: -0.7, swayX: 13, swayDeg: 16, driftX: -14, rockDuration: 2.2, alpha: 0.56 },
  { left: 41, size: 21, kind: 'lamp', fallDuration: 12.1, fallDelay: -11.2, swayDuration: 3.2, swayDelay: -1.9, swayX: 14, swayDeg: 14, driftX: 19, rockDuration: 2.6, alpha: 0.58 },
  { left: 80, size: 17, kind: 'gem', fallDuration: 9.9, fallDelay: -4.1, swayDuration: 2.6, swayDelay: -1.2, swayX: 13, swayDeg: 15, driftX: -17, rockDuration: 2.2, alpha: 0.58 },
];

const MODAL_JASMINE_PARTICLES: AmbientJasmineParticleSpec[] = CART_JASMINE_PARTICLES.filter(
  (_, idx) => idx % 2 === 0
).map(p => ({
  ...p,
  alpha: Math.round(p.alpha * 0.78 * 100) / 100,
  fallDuration: Math.round(p.fallDuration * 0.85 * 10) / 10,
}));

const AMBIENT_SPARKLES = [
  { left: '14%', top: '16%', size: 5.5, duration: '3.2s', delay: '-0.5s' },
  { left: '34%', top: '42%', size: 4.5, duration: '3.9s', delay: '-1.8s' },
  { left: '64%', top: '24%', size: 5.5, duration: '3.5s', delay: '-2.4s' },
  { left: '85%', top: '56%', size: 4.5, duration: '4.2s', delay: '-1.1s' },
  { left: '48%', top: '74%', size: 5.5, duration: '3.7s', delay: '-2.9s' },
  { left: '22%', top: '68%', size: 4.5, duration: '3.4s', delay: '-1.4s' },
  { left: '76%', top: '82%', size: 5, duration: '4.0s', delay: '-0.8s' },
];

/**
 * Pure `<g>` Royal Turquoise Tiara Jewel centered at (0, 0).
 * Uses outer `<g transform=...>` + optional inner animated `<g>` so CSS keyframes
 * never override SVG coordinates or blow up inside parent SVGs.
 */
function JasmineTiaraGemGroup({
  goldGradId,
  tealGradId,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  floatVariant,
}: {
  goldGradId: string;
  tealGradId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  floatVariant?: 'a' | 'b';
}) {
  const content = (
    <>
      {/* Outer golden filigree halo */}
      <ellipse cx="0" cy="1" rx="10.5" ry="12.5" fill={`url(#${goldGradId})`} stroke="#854d0e" strokeWidth="1.1" />
      {/* Top golden feather crest */}
      <path d="M 0 -15.5 C 2.6 -11.8, 2.6 -9.8, 0 -8 C -2.6 -9.8, -2.6 -11.8, 0 -15.5 Z" fill="#fef08a" stroke="#854d0e" strokeWidth="0.9" />
      {/* Pearl dots around bezel */}
      <circle cx="-8.8" cy="1" r="1.2" fill="#fef9c3" />
      <circle cx="8.8" cy="1" r="1.2" fill="#fef9c3" />
      <circle cx="0" cy="11.8" r="1.2" fill="#fef9c3" />
      {/* Inner sapphire-turquoise cabochon */}
      <ellipse cx="0" cy="1" rx="7.2" ry="9.2" fill={`url(#${tealGradId})`} stroke="#fef9c3" strokeWidth="0.9" />
      {/* Facet & specular gleam */}
      <ellipse cx="-2.4" cy="-2.8" rx="2.1" ry="3.5" transform="rotate(-18 -2.4 -2.8)" fill="#ffffff" fillOpacity="0.82" />
      <circle cx="2.5" cy="5.2" r="1.1" fill="#ccfbf1" fillOpacity="0.78" />
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
 * Pure `<g>` 5-Petal White Arabian Jasmine Blossom with Emerald Leaves centered at (0, 0).
 */
function JasmineBlossomGroup({
  flowerGradId,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  floatVariant,
}: {
  flowerGradId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  floatVariant?: 'a' | 'b';
}) {
  const content = (
    <>
      {/* Mint-emerald leaves */}
      <path d="M -12 8 C -8 2, -4 2, -1 6 C -5 10, -9 11, -12 8 Z" fill="#34d399" stroke="#047857" strokeWidth="0.85" />
      <path d="M 12 8 C 8 2, 4 2, 1 6 C 5 10, 9 11, 12 8 Z" fill="#10b981" stroke="#047857" strokeWidth="0.85" />
      {/* 5 Jasmine petals */}
      <g fill={`url(#${flowerGradId})`} stroke="#5eead4" strokeWidth="0.85">
        <ellipse cx="0" cy="-7.8" rx="3.8" ry="6.5" />
        <ellipse cx="0" cy="-7.8" rx="3.8" ry="6.5" transform="rotate(72)" />
        <ellipse cx="0" cy="-7.8" rx="3.8" ry="6.5" transform="rotate(144)" />
        <ellipse cx="0" cy="-7.8" rx="3.8" ry="6.5" transform="rotate(216)" />
        <ellipse cx="0" cy="-7.8" rx="3.8" ry="6.5" transform="rotate(288)" />
      </g>
      <circle cx="0" cy="0" r="3.2" fill="#facc15" stroke="#a16207" strokeWidth="0.75" />
      <circle cx="-0.9" cy="-0.9" r="1.1" fill="#fef9c3" />
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
 * Pure `<g>` Ornate Golden Genie Magic Lamp centered at (0, 0).
 */
function JasmineMagicLampGroup({
  goldGradId,
  tealGradId,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  floatVariant,
}: {
  goldGradId: string;
  tealGradId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  floatVariant?: 'a' | 'b';
}) {
  const content = (
    <>
      {/* Pedestal base */}
      <ellipse cx="-1" cy="9.5" rx="6.5" ry="2.2" fill="#a16207" stroke="#713f12" strokeWidth="0.95" />
      <path d="M -4.8 5.2 L 2.8 5.2 L 4.2 9 L -6.2 9 Z" fill={`url(#${goldGradId})`} stroke="#713f12" strokeWidth="0.95" />
      {/* Lamp body + elongated spout */}
      <path
        d="M -12.5 -0.5 C -12.5 -4, -7.2 -5.5, -1 -5.5 C 4.5 -5.5, 8.2 -3.4, 12.5 -6 C 15 -7.5, 17.2 -8, 18.8 -7 C 16.8 -4.5, 13.5 -1.5, 9.6 0.6 C 6.2 2.5, 3 5.2, -1 5.2 C -6.8 5.2, -12.5 2.6, -12.5 -0.5 Z"
        fill={`url(#${goldGradId})`}
        stroke="#713f12"
        strokeWidth="1.15"
      />
      {/* Ornate curved handle */}
      <path
        d="M -10.2 -2.6 C -15.8 -4.5, -17.2 1.5, -12.6 3.2 C -10.4 4, -9 2.5, -9.5 0.8"
        fill="none"
        stroke="#fef08a"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* Dome lid + finial */}
      <path d="M -4.8 -5.5 C -4.8 -9, 2.8 -9, 2.8 -5.5 Z" fill="#fef08a" stroke="#713f12" strokeWidth="0.95" />
      <circle cx="-1" cy="-10" r="1.6" fill="#fde047" stroke="#713f12" strokeWidth="0.75" />
      {/* Center turquoise jewel */}
      <ellipse cx="-1" cy="0" rx="2.4" ry="3" fill={`url(#${tealGradId})`} stroke="#fef9c3" strokeWidth="0.8" />
      <ellipse cx="-1.7" cy="-0.9" rx="0.7" ry="1.1" fill="#ffffff" fillOpacity="0.85" />
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
 * Pure `<g>` Glowing Golden Moroccan Palace Lantern centered at (0, 0).
 */
function JasmineLanternGroup({
  goldGradId,
  tealGradId,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  floatVariant,
}: {
  goldGradId: string;
  tealGradId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  floatVariant?: 'a' | 'b';
}) {
  const content = (
    <>
      <circle cx="0" cy="-12.5" r="2" fill="none" stroke="#ca8a04" strokeWidth="1.2" />
      {/* Onion dome top */}
      <path d="M -6.5 -5.5 C -6.5 -9.5, -2.5 -10.5, 0 -11.5 C 2.5 -10.5, 6.5 -9.5, 6.5 -5.5 Z" fill={`url(#${tealGradId})`} stroke="#0f766e" strokeWidth="0.95" />
      {/* Glowing glass lantern cage */}
      <rect x="-5.8" y="-5.5" width="11.6" height="12.5" rx="2.6" fill="#fef9c3" stroke="#a16207" strokeWidth="1.1" />
      {/* Inner warm flame glow */}
      <path d="M 0 -3 C 2.2 -0.2, 2.2 2.5, 0 4.5 C -2.2 2.5, -2.2 -0.2, 0 -3 Z" fill="#facc15" />
      {/* Moroccan lattice bars */}
      <line x1="-2" y1="-5.5" x2="-2" y2="7" stroke="#ca8a04" strokeWidth="0.8" />
      <line x1="2" y1="-5.5" x2="2" y2="7" stroke="#ca8a04" strokeWidth="0.8" />
      {/* Bottom finial */}
      <path d="M -4.5 7 L 4.5 7 L 0 11.5 Z" fill={`url(#${goldGradId})`} stroke="#854d0e" strokeWidth="0.9" />
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
 * Pure `<g>` Chibi Princess Jasmine Head centered at (0, 0) — with her iconic
 * black hair, turquoise headband, oval sapphire-teal jewel in gold setting, and gold hoop earrings.
 */
function JasminePrincessHeadGroup({
  goldGradId,
  tealGradId,
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
}: {
  goldGradId: string;
  tealGradId: string;
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      {/* Flowing black hair volume + braided side ponytail */}
      <path
        d="M -12 2 C -22 3, -26 11, -23 18 C -20 23, -12 22, -9 16 Z"
        fill="#1e1b4b"
        stroke="#0f172a"
        strokeWidth="1.1"
      />
      <ellipse cx="-19" cy="11" rx="4.2" ry="2" transform="rotate(-24 -19 11)" fill={`url(#${tealGradId})`} stroke="#0f766e" strokeWidth="0.8" />
      <circle cx="-23" cy="19" r="4.8" fill="#1e1b4b" stroke="#0f172a" strokeWidth="1" />
      <circle cx="0" cy="-1" r="15.5" fill="#1e1b4b" />

      {/* Large Golden Hoop Earrings */}
      <circle cx="-13.5" cy="5.5" r="4.8" fill="none" stroke="#facc15" strokeWidth="2.2" />
      <circle cx="13.5" cy="5.5" r="4.8" fill="none" stroke="#facc15" strokeWidth="2.2" />

      {/* Jasmine Face */}
      <path
        d="M -12 -2 C -12 -12, 12 -12, 12 -2 C 12 9, 6.8 15, 0 15 C -6.8 15, -12 9, -12 -2 Z"
        fill="#e3a685"
        stroke="#9a5b3c"
        strokeWidth="1.1"
      />
      {/* Rosy cheeks */}
      <ellipse cx="-7.2" cy="5.8" rx="2.6" ry="1.4" fill="#f43f5e" fillOpacity="0.3" />
      <ellipse cx="7.2" cy="5.8" rx="2.6" ry="1.4" fill="#f43f5e" fillOpacity="0.3" />

      {/* Expressive Arabian eyes & winged eyeliner */}
      <path d="M -8.5 -0.8 Q -5.2 -3 -2 -0.8 M 2 -0.8 Q 5.2 -3 8.5 -0.8" fill="none" stroke="#0f172a" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="-5.2" cy="1.8" rx="2.1" ry="2.4" fill="#291d18" />
      <ellipse cx="5.2" cy="1.8" rx="2.1" ry="2.4" fill="#291d18" />
      <circle cx="-5.8" cy="1.1" r="0.75" fill="#ffffff" />
      <circle cx="4.6" cy="1.1" r="0.75" fill="#ffffff" />

      {/* Sweet smile */}
      <path d="M -2.8 8.8 Q 0 11.2 2.8 8.8" fill="none" stroke="#9f1239" strokeWidth="1.3" strokeLinecap="round" />

      {/* Center-parted lustrous black hair bangs */}
      <path
        d="M -13.5 -2 C -13.5 -13, -4.5 -16, 0 -9.5 C 4.5 -16, 13.5 -13, 13.5 -2 C 9.8 -7, 4.5 -8.5, 0 -5.5 C -4.5 -8.5, -9.8 -7, -13.5 -2 Z"
        fill="#1e1b4b"
      />

      {/* Iconic Turquoise Headband & Sapphire-Teal Jewel in Gold Setting */}
      <path
        d="M -13 -7.5 C -7.5 -12, 7.5 -12, 13 -7.5 C 12.2 -4.5, 7.5 -8, 0 -8 C -7.5 -8, -12.2 -4.5, -13 -7.5 Z"
        fill={`url(#${tealGradId})`}
        stroke="#0f766e"
        strokeWidth="0.95"
      />
      <ellipse cx="0" cy="-9" rx="3.8" ry="4.8" fill={`url(#${goldGradId})`} stroke="#854d0e" strokeWidth="0.85" />
      <path d="M 0 -16 C 1.5 -13.5, 1.5 -12, 0 -11 C -1.5 -12, -1.5 -13.5, 0 -16 Z" fill="#fef08a" stroke="#854d0e" strokeWidth="0.65" />
      <ellipse cx="0" cy="-9" rx="2.5" ry="3.4" fill={`url(#${tealGradId})`} stroke="#fef9c3" strokeWidth="0.55" />
      <ellipse cx="-0.8" cy="-10.2" rx="0.75" ry="1.2" fill="#ffffff" fillOpacity="0.85" />
    </g>
  );
}

function AmbientJasmineGlyphSvg({
  kind,
  goldGradId,
  tealGradId,
  flowerGradId,
  rockStyle,
}: {
  kind: AmbientJasmineKind;
  goldGradId: string;
  tealGradId: string;
  flowerGradId: string;
  rockStyle: CSSProperties;
}) {
  if (kind === 'jasmine_princess') {
    return (
      <svg viewBox="-28 -18 52 38" className={styles.ambientRockGlyph} style={rockStyle}>
        <JasminePrincessHeadGroup goldGradId={goldGradId} tealGradId={tealGradId} />
      </svg>
    );
  }

  if (kind === 'lamp') {
    return (
      <svg viewBox="-18 -13 38 25" className={styles.ambientRockGlyph} style={rockStyle}>
        <JasmineMagicLampGroup goldGradId={goldGradId} tealGradId={tealGradId} />
      </svg>
    );
  }

  if (kind === 'gem') {
    return (
      <svg viewBox="-14 -17 28 32" className={styles.ambientRockGlyph} style={rockStyle}>
        <JasmineTiaraGemGroup goldGradId={goldGradId} tealGradId={tealGradId} />
      </svg>
    );
  }

  if (kind === 'lantern') {
    return (
      <svg viewBox="-12 -15 24 28" className={styles.ambientRockGlyph} style={rockStyle}>
        <JasmineLanternGroup goldGradId={goldGradId} tealGradId={tealGradId} />
      </svg>
    );
  }

  return (
    <svg viewBox="-16 -16 32 32" className={styles.ambientRockGlyph} style={rockStyle}>
      <JasmineBlossomGroup flowerGradId={flowerGradId} />
    </svg>
  );
}

/**
 * Continuous, silky-smooth Princess Jasmine & Agrabah Oasis ambient particle layer + corner palace watermarks.
 */
export function PosJasmineAmbientField({
  variant = 'cart',
}: {
  variant?: 'cart' | 'search' | 'modal';
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const goldGradId = `jas-amb-g-${uid}`;
  const tealGradId = `jas-amb-t-${uid}`;
  const flowerGradId = `jas-amb-f-${uid}`;

  const particles = variant === 'modal' ? MODAL_JASMINE_PARTICLES : CART_JASMINE_PARTICLES;
  const fallDist = variant === 'modal' ? '340px' : '680px';

  return (
    <div className={styles.ambientField} aria-hidden="true">
      <svg className={styles.defsSvg} aria-hidden="true">
        <defs>
          <linearGradient id={goldGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="48%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
          <linearGradient id={tealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#99f6e4" />
            <stop offset="52%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <radialGradient id={flowerGradId} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="35%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ccfbf1" />
          </radialGradient>
        </defs>
      </svg>

      {/* Top-right Agrabah Palace Domes, Silk Ribbon & Hanging Lanterns watermark */}
      <svg
        viewBox="0 0 210 138"
        className={`${styles.cornerPalace} ${variant === 'modal' ? styles.cornerPalaceModal : ''}`}
      >
        {/* Draped aqua silk ribbon */}
        <path
          d="M 48 6 C 92 38, 148 42, 208 24"
          fill="none"
          stroke={`url(#${tealGradId})`}
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.65"
        />
        <path
          d="M 48 6 C 92 38, 148 42, 208 24"
          fill="none"
          stroke="#facc15"
          strokeWidth="1.4"
          strokeDasharray="4 3"
        />
        {/* Agrabah Palace Onion Dome */}
        <path
          d="M 142 64 C 142 42, 162 32, 174 20 C 186 32, 206 42, 206 64 Z"
          fill={`url(#${tealGradId})`}
          stroke="#0f766e"
          strokeWidth="1.3"
        />
        <line x1="174" y1="10" x2="174" y2="20" stroke="#ca8a04" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="174" cy="14" r="2.2" fill="#facc15" />
        {/* Hanging Moroccan Lantern & Tiara Gems */}
        <line x1="112" y1="28" x2="112" y2="46" stroke="#ca8a04" strokeWidth="1.2" />
        <JasmineLanternGroup goldGradId={goldGradId} tealGradId={tealGradId} x={112} y={58} scale={0.85} />
        <JasmineTiaraGemGroup goldGradId={goldGradId} tealGradId={tealGradId} x={76} y={36} rotate={-18} scale={0.68} />
        <JasmineBlossomGroup flowerGradId={flowerGradId} x={148} y={82} rotate={16} scale={0.72} />
      </svg>

      {/* Bottom-left Magic Lamp & Jasmine blossoms trail watermark */}
      {variant !== 'modal' && (
        <svg viewBox="0 0 184 118" className={styles.bottomOasisTrail}>
          <JasmineMagicLampGroup goldGradId={goldGradId} tealGradId={tealGradId} x={46} y={84} rotate={-10} scale={1.15} />
          <JasmineBlossomGroup flowerGradId={flowerGradId} x={88} y={72} rotate={22} scale={0.74} />
          <JasmineTiaraGemGroup goldGradId={goldGradId} tealGradId={tealGradId} x={118} y={92} rotate={-16} scale={0.64} />
        </svg>
      )}

      {/* Ambient golden stardust sparkles */}
      {AMBIENT_SPARKLES.map((d, idx) => (
        <span
          key={idx}
          className={styles.ambientSparkle}
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

      {/* Continuous, silky-smooth floating Princess Jasmine, Magic Lamps, Tiara Jewels, Blossoms & Lanterns */}
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
              <AmbientJasmineGlyphSvg
                kind={p.kind}
                goldGradId={goldGradId}
                tealGradId={tealGradId}
                flowerGradId={flowerGradId}
                rockStyle={rockStyle}
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Bespoke Princess Jasmine, Agrabah Palace Arch & Golden Magic Lamp centerpiece for "Una venta empieza aquí".
 */
export function PosJasmineSearchEmptyHero() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const goldGradId = `jas-hero-g-${uid}`;
  const tealGradId = `jas-hero-t-${uid}`;
  const flowerGradId = `jas-hero-f-${uid}`;
  const carpetGradId = `jas-hero-c-${uid}`;
  const haloGradId = `jas-hero-h-${uid}`;
  const badgeGradId = `jas-hero-bg-${uid}`;

  return (
    <div className={styles.jasmineSearchEmpty}>
      <PosJasmineAmbientField variant="search" />

      <div className={styles.heroContent}>
        <div className={styles.heroSvgWrap} aria-hidden="true">
          <svg viewBox="0 0 248 166" className={styles.heroSvg}>
            <defs>
              <radialGradient id={haloGradId} cx="50%" cy="52%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
                <stop offset="58%" stopColor="#ccfbf1" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#ede9fe" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={badgeGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="100%" stopColor="#f0fdfa" stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id={goldGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef9c3" />
                <stop offset="48%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
              <linearGradient id={tealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#99f6e4" />
                <stop offset="52%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#0f766e" />
              </linearGradient>
              <radialGradient id={flowerGradId} cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="#fef9c3" />
                <stop offset="35%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#ccfbf1" />
              </radialGradient>
              <linearGradient id={carpetGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="55%" stopColor="#6d28d9" />
                <stop offset="100%" stopColor="#4c1d95" />
              </linearGradient>
            </defs>

            {/* Oasis turquoise & pearl aura behind composition */}
            <ellipse cx="124" cy="86" rx="98" ry="68" fill={`url(#${haloGradId})`} />

            {/* Royal Magic Carpet under the scene */}
            <ellipse cx="124" cy="146" rx="76" ry="10" fill="#14b8a6" fillOpacity="0.22" />
            <path
              d="M 46 132 C 74 122, 174 122, 202 132 C 194 145, 174 150, 124 150 C 74 150, 54 145, 46 132 Z"
              fill={`url(#${carpetGradId})`}
              stroke="#facc15"
              strokeWidth="1.8"
            />
            <path
              d="M 56 135 C 82 127, 166 127, 192 135"
              fill="none"
              stroke="#fef08a"
              strokeWidth="1.3"
              strokeDasharray="4 3"
            />
            {/* Gold carpet tassels */}
            <path d="M 46 132 L 37 140 L 43 144 L 49 136 Z" fill="#facc15" stroke="#854d0e" strokeWidth="0.9" />
            <path d="M 202 132 L 211 140 L 205 144 L 199 136 Z" fill="#facc15" stroke="#854d0e" strokeWidth="0.9" />

            {/* Central Agrabah Palace Dome & Barcode Scanner Medallion */}
            <g transform="translate(92, 48)">
              {/* Agrabah Turquoise Onion Dome on top of scanner */}
              <path
                d="M 10 4 C 10 -12, 24 -18, 32 -28 C 40 -18, 54 -12, 54 4 Z"
                fill={`url(#${tealGradId})`}
                stroke="#0f766e"
                strokeWidth="1.4"
              />
              {/* Golden spire & crescent finial */}
              <line x1="32" y1="-36" x2="32" y2="-27" stroke="#ca8a04" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="32" cy="-32" r="2.2" fill="#facc15" />
              {/* Tiara jewel on dome front */}
              <ellipse cx="32" cy="-7" rx="3.8" ry="4.8" fill={`url(#${goldGradId})`} stroke="#854d0e" strokeWidth="0.9" />
              <ellipse cx="32" cy="-7" rx="2.4" ry="3.2" fill="#0d9488" stroke="#fef9c3" strokeWidth="0.6" />

              {/* Scanner Medallion Body */}
              <rect
                x="0"
                y="0"
                width="64"
                height="64"
                rx="20"
                fill={`url(#${badgeGradId})`}
                stroke="#2dd4bf"
                strokeWidth="1.7"
              />
              <rect
                x="4"
                y="4"
                width="56"
                height="56"
                rx="16"
                fill="none"
                stroke="#facc15"
                strokeWidth="1.2"
                strokeDasharray="3.5 2.5"
              />
              {/* Scanner viewfinder corners */}
              <path
                d="M 17 24 V 19 A 3 3 0 0 1 20 16 H 25 M 39 16 H 44 A 3 3 0 0 1 47 19 V 24 M 47 40 V 45 A 3 3 0 0 1 44 48 H 39 M 25 48 H 20 A 3 3 0 0 1 17 45 V 40"
                fill="none"
                stroke="#0d9488"
                strokeWidth="2.1"
                strokeLinecap="round"
              />
              {/* Crisp barcode bars */}
              <path
                d="M 24 23 V 41 M 28.5 23 V 41 M 32 23 V 41 M 36.5 23 V 41 M 40 23 V 41"
                fill="none"
                stroke="#134e4a"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.86"
              />
              {/* Oasis turquoise & gold laser scan sweep */}
              <line
                x1="19"
                y1="32"
                x2="45"
                y2="32"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeLinecap="round"
                className={styles.scannerPulseLine}
              />
            </g>

            {/* Left Hero: Princess Jasmine sitting gracefully beside the palace scanner */}
            <g transform="translate(62, 98)">
              <g className={styles.jasmineBreathe}>
                {/* Turquoise silk harem outfit & golden collar necklace */}
                <path
                  d="M -16 32 C -14 14, -8 8, 0 8 C 8 8, 14 14, 16 32 Z"
                  fill={`url(#${tealGradId})`}
                  stroke="#0f766e"
                  strokeWidth="1.2"
                />
                {/* Off-shoulder sheer aqua sleeves */}
                <ellipse cx="-14" cy="18" rx="4.5" ry="6.5" transform="rotate(16 -14 18)" fill="#99f6e4" stroke="#0d9488" strokeWidth="1" />
                <ellipse cx="14" cy="18" rx="4.5" ry="6.5" transform="rotate(-16 14 18)" fill="#99f6e4" stroke="#0d9488" strokeWidth="1" />
                {/* Royal Gold Collar Necklace */}
                <path
                  d="M -9 9 C -4 14, 4 14, 9 9 C 10 12, 5 17, 0 17 C -5 17, -10 12, -9 9 Z"
                  fill={`url(#${goldGradId})`}
                  stroke="#854d0e"
                  strokeWidth="1"
                />
                {/* Princess Jasmine Head */}
                <JasminePrincessHeadGroup goldGradId={goldGradId} tealGradId={tealGradId} x={0} y={-8} scale={1.12} />
              </g>
            </g>

            {/* Right Hero: Golden Genie Magic Lamp + Rising Magic Stardust Swirl */}
            <g transform="translate(182, 96)">
              <g className={styles.magicSwirl}>
                <path
                  d="M 14 -6 C 24 -20, 2 -32, 14 -48 C 22 -58, 34 -52, 28 -66"
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="2.2"
                  strokeDasharray="3.5 3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 18 -8 C 28 -22, 8 -34, 20 -50"
                  fill="none"
                  stroke="#2dd4bf"
                  strokeWidth="1.8"
                  strokeDasharray="3 4"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="-34" r="2.2" fill="#facc15" />
                <circle cx="24" cy="-42" r="1.8" fill="#2dd4bf" />
                <circle cx="18" cy="-58" r="2.2" fill="#fde047" />
              </g>
            </g>

            <JasmineMagicLampGroup
              goldGradId={goldGradId}
              tealGradId={tealGradId}
              x={178}
              y={114}
              rotate={-6}
              scale={1.25}
              floatVariant="a"
            />

            {/* Top-Right Glowing Moroccan Lantern */}
            <JasmineLanternGroup
              goldGradId={goldGradId}
              tealGradId={tealGradId}
              x={186}
              y={34}
              rotate={8}
              scale={0.92}
              floatVariant="b"
            />

            {/* Well-separated floating Arabian Jasmine Blossoms & Tiara Jewels (pure <g> stamps) */}
            <JasmineBlossomGroup flowerGradId={flowerGradId} x={24} y={40} rotate={-18} scale={0.76} floatVariant="a" />
            <JasmineTiaraGemGroup
              goldGradId={goldGradId}
              tealGradId={tealGradId}
              x={28}
              y={114}
              rotate={16}
              scale={0.68}
              floatVariant="b"
            />
            <JasmineBlossomGroup flowerGradId={flowerGradId} x={222} y={76} rotate={22} scale={0.74} floatVariant="a" />
          </svg>
        </div>

        <span className={styles.heroBadgePill}>&#x1F48E; &middot; Palacio de Agrabah POS</span>
        <span className={styles.heroTitle}>Una venta empieza aqu&iacute;</span>

        <div className={styles.heroOrnamentRow} aria-hidden="true">
          <span className={styles.heroOrnamentLine} />
          <svg width="16" height="16" viewBox="-14 -17 28 32">
            <JasmineTiaraGemGroup goldGradId={goldGradId} tealGradId={tealGradId} />
          </svg>
          <span className={styles.heroOrnamentLine} />
        </div>

        <span className={styles.heroSubtitle}>
          Busca por nombre o escanea un c&oacute;digo. Enter agrega una coincidencia exacta; puedes seguir escaneando.
        </span>

        <div className={styles.heroHintRow}>
          <span className={styles.heroPill}>&#x1F9DE; L&aacute;mpara Scanner Ready</span>
          <span className={styles.heroPill}>&#x1F48E; Tesoro de Agrabah</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Princess Jasmine & Golden Magic Lamp on Royal Cushion for empty "Venta actual".
 */
export function PosJasmineCartEmptyArt() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const goldGradId = `jas-cart-g-${uid}`;
  const tealGradId = `jas-cart-t-${uid}`;
  const flowerGradId = `jas-cart-f-${uid}`;
  const cushionGradId = `jas-cart-c-${uid}`;

  return (
    <div className={styles.cartEmptyWrap}>
      <svg viewBox="0 0 164 122" className={styles.cartEmptySvg} aria-hidden="true">
        <defs>
          <linearGradient id={goldGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="48%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
          <linearGradient id={tealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#99f6e4" />
            <stop offset="52%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <radialGradient id={flowerGradId} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="35%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ccfbf1" />
          </radialGradient>
          <linearGradient id={cushionGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="55%" stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
        </defs>

        {/* Princess Jasmine peeking cheerfully above the royal cushion */}
        <g className={styles.jasmineBreathe}>
          <JasminePrincessHeadGroup goldGradId={goldGradId} tealGradId={tealGradId} x={64} y={42} rotate={-4} scale={1.02} />
        </g>

        {/* Royal Tasseled Cushion Base */}
        <ellipse cx="82" cy="102" rx="52" ry="8" fill="#14b8a6" fillOpacity="0.2" />
        <path
          d="M 30 84 C 52 72, 112 72, 134 84 C 128 98, 110 102, 82 102 C 54 102, 36 98, 30 84 Z"
          fill={`url(#${cushionGradId})`}
          stroke="#facc15"
          strokeWidth="1.6"
        />
        <path
          d="M 38 86 C 58 78, 106 78, 126 86"
          fill="none"
          stroke="#fef08a"
          strokeWidth="1.3"
          strokeDasharray="4 3"
        />
        <path d="M 30 84 L 22 92 L 28 95 L 33 88 Z" fill="#facc15" stroke="#854d0e" strokeWidth="0.9" />
        <path d="M 134 84 L 142 92 L 136 95 L 131 88 Z" fill="#facc15" stroke="#854d0e" strokeWidth="0.9" />

        {/* Golden Magic Lamp on the Cushion */}
        <JasmineMagicLampGroup
          goldGradId={goldGradId}
          tealGradId={tealGradId}
          x={104}
          y={74}
          rotate={-8}
          scale={1.18}
          floatVariant="a"
        />

        {/* Floating Blossom & Tiara Gem stamps */}
        <JasmineBlossomGroup flowerGradId={flowerGradId} x={26} y={46} rotate={-20} scale={0.68} floatVariant="a" />
        <JasmineTiaraGemGroup
          goldGradId={goldGradId}
          tealGradId={tealGradId}
          x={136}
          y={38}
          rotate={16}
          scale={0.62}
          floatVariant="b"
        />
      </svg>

      <span className={styles.cartEmptyTitle}>El tesoro real espera tu venta</span>
      <span className={styles.cartEmptySub}>
        Agrega productos desde el buscador para preparar tu venta en Agrabah
      </span>
    </div>
  );
}

/**
 * Tiara-crowned check medallion for "Venta cobrada" (`PosSaleResult`).
 */
export function PosJasmineCheckMedallion() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const goldGradId = `jas-chk-g-${uid}`;
  const tealGradId = `jas-chk-t-${uid}`;

  return (
    <div className={styles.modalCheckMedallion}>
      <svg viewBox="0 0 64 64" className={styles.modalCheckSvg} aria-hidden="true">
        <defs>
          <linearGradient id={goldGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="50%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
          <linearGradient id={tealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ccfbf1" />
            <stop offset="55%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="34" r="24" fill={`url(#${tealGradId})`} stroke="#eab308" strokeWidth="2.2" />
        <circle cx="32" cy="34" r="19.5" fill="#ffffff" fillOpacity="0.94" stroke="#2dd4bf" strokeWidth="1.2" />
        {/* Princess Jasmine Tiara Jewel Crown on top */}
        <path d="M 18 16 Q 32 8 46 16" fill="none" stroke="#eab308" strokeWidth="2.4" strokeLinecap="round" />
        <ellipse cx="32" cy="12" rx="4.6" ry="5.8" fill={`url(#${goldGradId})`} stroke="#854d0e" strokeWidth="1" />
        <ellipse cx="32" cy="12" rx="3" ry="4" fill="#0d9488" stroke="#fef9c3" strokeWidth="0.6" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="#0f766e"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: 'relative', zIndex: 2, marginTop: '4px' }}
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

/**
 * Agrabah palace domes & hanging golden lantern garland for the top-right of the Sale Result modal.
 */
export function PosJasmineModalHeaderArt() {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const goldGradId = `jas-mhd-g-${uid}`;
  const tealGradId = `jas-mhd-t-${uid}`;
  const flowerGradId = `jas-mhd-f-${uid}`;

  return (
    <svg viewBox="0 0 220 106" className={styles.modalHeaderArt} aria-hidden="true">
      <defs>
        <linearGradient id={goldGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="48%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        <linearGradient id={tealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#99f6e4" />
          <stop offset="52%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
        <radialGradient id={flowerGradId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="35%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ccfbf1" />
        </radialGradient>
      </defs>

      <g opacity="0.82">
        <JasminePrincessHeadGroup goldGradId={goldGradId} tealGradId={tealGradId} x={162} y={38} rotate={-8} scale={0.95} />
        <JasmineMagicLampGroup goldGradId={goldGradId} tealGradId={tealGradId} x={112} y={30} rotate={-14} scale={0.85} />
        <JasmineBlossomGroup flowerGradId={flowerGradId} x={86} y={66} rotate={18} scale={0.62} floatVariant="a" />
      </g>
    </svg>
  );
}
