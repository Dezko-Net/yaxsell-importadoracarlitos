'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import styles from './pos-neko-rain.module.css';
import type { PosNekoVariant } from './PosNekoDecor';

type NekoRainKind = 'michi' | 'paw' | 'yarn' | 'bell';

interface NekoFallParticle {
  id: string;
  batchId: number;
  kind: NekoRainKind;
  left: number;
  size: number;
  fallDuration: number;
  fallDelay: number;
  swayDuration: number;
  swayDelay: number;
  swayAmp: number;
  swayDeg: number;
  windDrift: number;
  tumbleDuration: number;
  opacity: number;
}

function createNekoBurstWave(batchId: number, count = 36): NekoFallParticle[] {
  const wave: NekoFallParticle[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    const kind: NekoRainKind =
      roll < 0.34 ? 'michi' : roll < 0.68 ? 'paw' : roll < 0.86 ? 'yarn' : 'bell';

    const size =
      kind === 'michi'
        ? Math.round(26 + Math.random() * 12) // 26px - 38px
        : kind === 'paw'
        ? Math.round(20 + Math.random() * 10) // 20px - 30px
        : Math.round(18 + Math.random() * 9); // 18px - 27px

    const bucket = (i / count) * 104 - 2;
    const jitter = (Math.random() - 0.5) * 6;
    const left = Math.round(Math.max(-3, Math.min(103, bucket + jitter)) * 10) / 10;

    const fallDuration = Math.round((2.9 + Math.random() * 1.9) * 100) / 100;
    const fallDelay = Math.round(Math.random() * 1.45 * 100) / 100;

    const swayDuration = Math.round((1.5 + Math.random() * 1.2) * 100) / 100;
    const swayDelay = Math.round(-Math.random() * 2.4 * 100) / 100;
    const swayAmp = Math.round(15 + Math.random() * 22);
    const swayDeg = Math.round(14 + Math.random() * 18);

    const windDrift = Math.round((Math.random() * 64 - 22) * 10) / 10;
    const tumbleDuration = Math.round((1.4 + Math.random() * 1.2) * 100) / 100;
    const opacity = Math.round((0.86 + Math.random() * 0.12) * 100) / 100;

    wave.push({
      id: `${batchId}-${i}`,
      batchId,
      kind,
      left,
      size,
      fallDuration,
      fallDelay,
      swayDuration,
      swayDelay,
      swayAmp,
      swayDeg,
      windDrift,
      tumbleDuration,
      opacity,
    });
  }

  return wave;
}

function NekoRainGlyph({
  kind,
  furGradId,
  pawGradId,
  yarnGradId,
  bellGradId,
  tumbleStyle,
  isFernanda,
}: {
  kind: NekoRainKind;
  furGradId: string;
  pawGradId: string;
  yarnGradId: string;
  bellGradId: string;
  tumbleStyle: CSSProperties;
  isFernanda: boolean;
}) {
  if (kind === 'michi') {
    if (isFernanda) {
      return (
        <svg viewBox="0 0 48 42" className={styles.tumbleGlyph} style={tumbleStyle}>
          {/* Brown-Tabby Ears */}
          <path
            d="M 8 19 L 6 5 L 18 12 Z M 40 19 L 42 5 L 30 12 Z"
            fill="#4b3b30"
            stroke="#1f1610"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path d="M 9.5 16.5 L 8.2 8 L 16 12.5 Z M 38.5 16.5 L 39.8 8 L 32 12.5 Z" fill="#fda4af" opacity="0.88" />
          {/* Snowy White Head */}
          <ellipse cx="24" cy="24" rx="16" ry="13" fill="#ffffff" stroke="#475569" strokeWidth="1.1" />
          {/* Brown-Tabby Cap over Forehead with White Blaze */}
          <path d="M 8.5 22 C 9 13.5, 16 10.5, 22.2 12 C 22.6 16.5, 19.2 20.5, 14 23 Z" fill="#4b3b30" />
          <path d="M 39.5 22 C 39 13.5, 32 10.5, 25.8 12 C 25.4 16.5, 28.8 20.5, 34 23 Z" fill="#4b3b30" />
          {/* Fernanda's Cat Nose Smudge */}
          <ellipse cx="23.4" cy="24.8" rx="2.5" ry="2.8" fill="#4b3b30" opacity="0.9" />
          {/* Olive-Green Eyes */}
          <circle cx="17.5" cy="22.8" r="2.3" fill="#7d9c3a" stroke="#1f1610" strokeWidth="0.65" />
          <circle cx="16.9" cy="22.1" r="0.7" fill="#ffffff" />
          <circle cx="30.5" cy="22.8" r="2.3" fill="#7d9c3a" stroke="#1f1610" strokeWidth="0.65" />
          <circle cx="29.9" cy="22.1" r="0.7" fill="#ffffff" />
          {/* Terracotta-Pink Nose & :3 mouth */}
          <polygon points="24,26.4 22.2,24.5 25.8,24.5" fill="#c46358" />
          <path
            d="M 20.4 28.2 Q 22.2 30.2 24 28 Q 25.8 30.2 27.6 28.2"
            fill="none"
            stroke="#3b2820"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 48 42" className={styles.tumbleGlyph} style={tumbleStyle}>
        {/* Ears */}
        <path
          d="M 8 19 L 6 5 L 18 12 Z M 40 19 L 42 5 L 30 12 Z"
          fill={`url(#${furGradId})`}
          stroke="#9a3e0e"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path d="M 9.5 16.5 L 8.2 8 L 16 12.5 Z M 38.5 16.5 L 39.8 8 L 32 12.5 Z" fill="#fda4af" opacity="0.88" />
        {/* Head */}
        <ellipse
          cx="24"
          cy="24"
          rx="16"
          ry="13"
          fill={`url(#${furGradId})`}
          stroke="#9a3e0e"
          strokeWidth="1.1"
        />
        {/* Tabby stripes (forehead M + cheek stripes) */}
        <path
          d="M 20.2 13.2 L 21.6 17.5 M 24 12.5 L 24 17.2 M 27.8 13.2 L 26.4 17.5"
          stroke="#b44d12"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M 9.5 22.5 L 13 23.2 M 9.8 25.5 L 13.2 25.8 M 38.5 22.5 L 35 23.2 M 38.2 25.5 L 34.8 25.8"
          stroke="#b44d12"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        {/* Cream muzzle & rosy cheeks */}
        <ellipse cx="24" cy="28" rx="9" ry="6.5" fill="#fff7ed" />
        <ellipse cx="14" cy="26.8" rx="2.8" ry="1.7" fill="#fb7185" opacity="0.6" />
        <ellipse cx="34" cy="26.8" rx="2.8" ry="1.7" fill="#fb7185" opacity="0.6" />
        {/* Eyes */}
        <circle cx="17.5" cy="22.8" r="2.1" fill="#361605" />
        <circle cx="16.9" cy="22.1" r="0.7" fill="#ffffff" />
        <circle cx="30.5" cy="22.8" r="2.1" fill="#361605" />
        <circle cx="29.9" cy="22.1" r="0.7" fill="#ffffff" />
        {/* Pink nose & :3 kitty mouth */}
        <polygon points="24,26.4 22.2,24.5 25.8,24.5" fill="#f43f5e" />
        <path
          d="M 20.4 28.2 Q 22.2 30.2 24 28 Q 25.8 30.2 27.6 28.2"
          fill="none"
          stroke="#522810"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        {/* Whiskers */}
        <path
          d="M 4 24.5 L 11 25.5 M 4.5 28 L 11.2 27.8 M 44 24.5 L 37 25.5 M 43.5 28 L 36.8 27.8"
          stroke="#7c3a16"
          strokeWidth="0.95"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'yarn') {
    return (
      <svg viewBox="0 0 36 36" className={styles.tumbleGlyph} style={tumbleStyle}>
        <circle
          cx="17"
          cy="17"
          r="12.5"
          fill={`url(#${yarnGradId})`}
          stroke={isFernanda ? '#881337' : '#b44d12'}
          strokeWidth="1"
        />
        <path
          d="M 7 12 Q 17 6 27 13 M 6 17 Q 17 11 28 18 M 8 22 Q 17 16 26 23 M 13 6 Q 21 17 14 28 M 19 6 Q 26 17 20 28"
          fill="none"
          stroke={isFernanda ? '#881337' : '#9a3412'}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.65"
        />
        <path
          d="M 27 24 C 31 27, 34 24, 34 29 C 34 32, 30 33, 27 31"
          fill="none"
          stroke={isFernanda ? '#e11d48' : '#ea580c'}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'bell') {
    return (
      <svg viewBox="0 0 32 32" className={styles.tumbleGlyph} style={tumbleStyle}>
        <circle cx="16" cy="6" r="2.8" fill="none" stroke="#ca8a04" strokeWidth="1.6" />
        <circle cx="16" cy="17.5" r="10" fill={`url(#${bellGradId})`} stroke="#a16207" strokeWidth="1" />
        <path d="M 6.5 16.2 H 25.5" stroke="#a16207" strokeWidth="1.2" />
        <circle cx="16" cy="21.2" r="2.1" fill="#713f12" />
        <line x1="16" y1="22.8" x2="16" y2="27" stroke="#713f12" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // Cushioned Toe-Bean Cat Paw (`paw`)
  return (
    <svg viewBox="0 0 36 36" className={styles.tumbleGlyph} style={tumbleStyle}>
      <circle
        cx="18"
        cy="18"
        r="15.5"
        fill={isFernanda ? '#fff5f7' : '#fffaf3'}
        stroke={isFernanda ? '#f4a3b4' : '#f5b886'}
        strokeWidth="1.1"
      />
      <path
        d="M 18 17.5 C 13.5 17.5, 10.5 21, 11.8 25 C 12.6 27.5, 15.5 27.5, 18 26.2 C 20.5 27.5, 23.4 27.5, 24.2 25 C 25.5 21, 22.5 17.5, 18 17.5 Z"
        fill={`url(#${pawGradId})`}
      />
      <ellipse cx="10.8" cy="15.2" rx="2.6" ry="3.5" transform="rotate(-22 10.8 15.2)" fill={`url(#${pawGradId})`} />
      <ellipse cx="15.3" cy="11.8" rx="2.6" ry="3.7" transform="rotate(-7 15.3 11.8)" fill={`url(#${pawGradId})`} />
      <ellipse cx="20.7" cy="11.8" rx="2.6" ry="3.7" transform="rotate(7 20.7 11.8)" fill={`url(#${pawGradId})`} />
      <ellipse cx="25.2" cy="15.2" rx="2.6" ry="3.5" transform="rotate(22 25.2 15.2)" fill={`url(#${pawGradId})`} />
    </svg>
  );
}

export default function PosNekoRain({
  trigger,
  autoBurstOnMount = false,
  count = 36,
  nekoVariant = 'mikan',
}: {
  trigger: number;
  autoBurstOnMount?: boolean;
  count?: number;
  nekoVariant?: PosNekoVariant;
}) {
  const [particles, setParticles] = useState<NekoFallParticle[]>([]);
  const batchCounterRef = useRef(0);
  const lastSpawnAtRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const furGradId = `neko-rain-f-${uid}`;
  const pawGradId = `neko-rain-p-${uid}`;
  const yarnGradId = `neko-rain-y-${uid}`;
  const bellGradId = `neko-rain-b-${uid}`;
  const isFernanda = nekoVariant === 'fernanda';

  const spawnWave = (particleCount: number) => {
    const now = Date.now();
    if (now - lastSpawnAtRef.current < 750) return;
    lastSpawnAtRef.current = now;

    const batchId = ++batchCounterRef.current;
    const wave = createNekoBurstWave(batchId, particleCount);

    setParticles(prev => [...prev, ...wave]);

    const cleanupTimer = setTimeout(() => {
      setParticles(prev => prev.filter(item => item.batchId !== batchId));
      timersRef.current.delete(cleanupTimer);
    }, 6600);
    timersRef.current.add(cleanupTimer);
  };

  useEffect(() => {
    if (autoBurstOnMount) {
      spawnWave(count);
    }
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (trigger <= 0) return;
    spawnWave(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div className={styles.rainOverlay} aria-hidden="true">
      <svg className={styles.defsSvg} aria-hidden="true">
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

      {particles.map(p => {
        const fallStyle: CSSProperties = {
          left: `${p.left}%`,
          width: `${p.size}px`,
          height: `${p.size}px`,
          animationDuration: `${p.fallDuration}s, ${p.fallDuration}s`,
          animationDelay: `${p.fallDelay}s, ${p.fallDelay}s`,
          ['--wind-drift' as string]: `${p.windDrift}px`,
          ['--p-opacity' as string]: String(p.opacity),
        };

        const swayStyle: CSSProperties = {
          animationDuration: `${p.swayDuration}s`,
          animationDelay: `${p.swayDelay}s`,
          ['--sway-amp' as string]: `${p.swayAmp}px`,
        };

        const tumbleStyle: CSSProperties = {
          animationDuration: `${p.tumbleDuration}s`,
          animationDelay: `${p.swayDelay}s`,
          ['--sway-deg' as string]: `${p.swayDeg}deg`,
        };

        return (
          <span key={p.id} className={styles.fallTrack} style={fallStyle}>
            <span className={styles.swayTrack} style={swayStyle}>
              <NekoRainGlyph
                kind={p.kind}
                furGradId={furGradId}
                pawGradId={pawGradId}
                yarnGradId={yarnGradId}
                bellGradId={bellGradId}
                tumbleStyle={tumbleStyle}
                isFernanda={isFernanda}
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}
