'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import styles from './pos-sakura-rain.module.css';

type SakuraGlyphKind = 'blossom' | 'notched' | 'curled' | 'duo';

interface SakuraFallParticle {
  id: string;
  batchId: number;
  kind: SakuraGlyphKind;
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
  tumbleReverse: boolean;
  opacity: number;
}

function createBurstWave(batchId: number, count = 38): SakuraFallParticle[] {
  const wave: SakuraFallParticle[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    const kind: SakuraGlyphKind =
      roll < 0.36 ? 'blossom' : roll < 0.68 ? 'notched' : roll < 0.88 ? 'curled' : 'duo';

    const size =
      kind === 'blossom'
        ? Math.round(22 + Math.random() * 13) // 22px - 35px
        : kind === 'duo'
        ? Math.round(18 + Math.random() * 8) // 18px - 26px
        : Math.round(13 + Math.random() * 10); // 13px - 23px

    // Evenly stratified horizontal distribution with organic jitter so there are no gaps
    const bucket = (i / count) * 104 - 2;
    const jitter = (Math.random() - 0.5) * 6;
    const left = Math.round(Math.max(-3, Math.min(103, bucket + jitter)) * 10) / 10;

    // Constant terminal velocity per particle (2.9s to 4.8s)
    const fallDuration = Math.round((2.9 + Math.random() * 1.9) * 100) / 100;
    const fallDelay = Math.round(Math.random() * 1.5 * 100) / 100;

    // Smooth sinusoidal horizontal sway
    const swayDuration = Math.round((1.5 + Math.random() * 1.3) * 100) / 100;
    const swayDelay = Math.round(-Math.random() * 2.5 * 100) / 100;
    const swayAmp = Math.round(16 + Math.random() * 24);
    const swayDeg = Math.round(12 + Math.random() * 16);

    // Gentle diagonal spring breeze drift
    const windDrift = Math.round((Math.random() * 70 - 20) * 10) / 10;

    // Smooth 360° 3D rotation
    const tumbleDuration =
      kind === 'blossom'
        ? Math.round((4.5 + Math.random() * 3.0) * 100) / 100
        : Math.round((2.8 + Math.random() * 2.2) * 100) / 100;
    const tumbleReverse = Math.random() < 0.5;
    const opacity = Math.round((0.82 + Math.random() * 0.16) * 100) / 100;

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
      tumbleReverse,
      opacity,
    });
  }

  return wave;
}

function RainGlyph({
  kind,
  petalGradId,
  centerGradId,
  tumbleStyle,
}: {
  kind: SakuraGlyphKind;
  petalGradId: string;
  centerGradId: string;
  tumbleStyle: CSSProperties;
}) {
  if (kind === 'blossom') {
    return (
      <svg viewBox="0 0 64 64" className={styles.tumbleGlyph} style={tumbleStyle}>
        {[0, 72, 144, 216, 288].map(deg => (
          <g key={deg} transform={`rotate(${deg} 32 32)`}>
            <path
              d="M 32 30.2 C 25.2 24.6, 21.2 16.4, 25.0 9.0 C 26.4 6.2, 29.2 6.6, 32 11.2 C 34.8 6.6, 37.6 6.2, 39.0 9.0 C 42.8 16.4, 38.8 24.6, 32 30.2 Z"
              fill={`url(#${petalGradId})`}
              stroke="#e575a1"
              strokeWidth="0.7"
              strokeOpacity="0.6"
            />
            <path
              d="M 32 27.5 L 32 14.5"
              stroke="#e575a1"
              strokeWidth="0.55"
              strokeLinecap="round"
              opacity="0.38"
            />
          </g>
        ))}
        <circle cx="32" cy="32" r="8" fill={`url(#${centerGradId})`} />
        {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg, idx) => {
          const tip = idx % 2 === 0 ? 23.2 : 24.8;
          return (
            <g key={deg} transform={`rotate(${deg} 32 32)`}>
              <line
                x1="32"
                y1="32"
                x2="32"
                y2={tip}
                stroke="#f59e0b"
                strokeWidth="0.85"
                strokeLinecap="round"
                opacity="0.85"
              />
              <circle cx="32" cy={tip} r="1.2" fill="#fbbf24" />
            </g>
          );
        })}
        <circle cx="32" cy="32" r="2.1" fill="#be185d" opacity="0.85" />
      </svg>
    );
  }

  if (kind === 'curled') {
    return (
      <svg viewBox="0 0 32 32" className={styles.tumbleGlyph} style={tumbleStyle}>
        <path
          d="M 6.5 26.5 C 4.5 18, 8.8 7.6, 18.2 4.6 C 20.8 3.8, 21.8 5.5, 20.4 8.5 C 23.6 7.6, 25.8 9.2, 24.6 12.4 C 21.8 20.0, 14.2 25.8, 6.5 26.5 Z"
          fill={`url(#${petalGradId})`}
          stroke="#e575a1"
          strokeWidth="0.65"
          strokeOpacity="0.55"
        />
        <path
          d="M 6.5 26.5 C 6.2 19.2, 10.4 10.6, 18.2 4.6 C 14.6 11.6, 11.4 18.8, 6.5 26.5 Z"
          fill="#fff7fa"
          opacity="0.65"
        />
      </svg>
    );
  }

  if (kind === 'duo') {
    return (
      <svg viewBox="0 0 36 36" className={styles.tumbleGlyph} style={tumbleStyle}>
        <g transform="translate(11, 5) rotate(28 12 16) scale(0.72)" opacity="0.82">
          <path
            d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
            fill={`url(#${petalGradId})`}
            stroke="#e575a1"
            strokeWidth="0.6"
            strokeOpacity="0.5"
          />
        </g>
        <g transform="translate(-3, -1) rotate(-14 16 18) scale(0.86)">
          <path
            d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
            fill={`url(#${petalGradId})`}
            stroke="#e575a1"
            strokeWidth="0.65"
            strokeOpacity="0.55"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 36" className={styles.tumbleGlyph} style={tumbleStyle}>
      <path
        d="M 16 33 C 9.5 27, 5 17.5, 9.2 8.2 C 10.8 4.6, 13.8 5, 16 9.4 C 18.2 5, 21.2 4.6, 22.8 8.2 C 27 17.5, 22.5 27, 16 33 Z"
        fill={`url(#${petalGradId})`}
        stroke="#e575a1"
        strokeWidth="0.65"
        strokeOpacity="0.55"
      />
      <path
        d="M 16 30.5 Q 14.4 20 13.2 12.5 M 16 30.5 Q 17.6 20 18.8 12.5"
        fill="none"
        stroke="#e575a1"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.38"
      />
    </svg>
  );
}

export default function PosSakuraRain({
  trigger,
  autoBurstOnMount = false,
  count = 38,
}: {
  trigger: number;
  autoBurstOnMount?: boolean;
  count?: number;
}) {
  const [particles, setParticles] = useState<SakuraFallParticle[]>([]);
  const batchCounterRef = useRef(0);
  const lastSpawnAtRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const petalGradId = `sakura-rain-p-${uid}`;
  const centerGradId = `sakura-rain-c-${uid}`;

  const spawnWave = (particleCount: number) => {
    const now = Date.now();
    // Prevent duplicate micro-triggers within 750ms from stacking redundantly
    if (now - lastSpawnAtRef.current < 750) return;
    lastSpawnAtRef.current = now;

    const batchId = ++batchCounterRef.current;
    const wave = createBurstWave(batchId, particleCount);

    // Append wave instead of replacing in-flight particles so nothing ever jumps or resets!
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
          <linearGradient id={petalGradId} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#fff7fa" />
            <stop offset="52%" stopColor="#fbc7de" />
            <stop offset="100%" stopColor="#ef85b0" />
          </linearGradient>
          <radialGradient id={centerGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d6457b" stopOpacity="0.65" />
            <stop offset="65%" stopColor="#f472b6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#fbcfe8" stopOpacity="0" />
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
          ['--sway-deg' as string]: `${p.swayDeg}deg`,
        };

        const tumbleStyle: CSSProperties = {
          animationDuration: `${p.tumbleDuration}s`,
          animationDirection: p.tumbleReverse ? 'reverse' : 'normal',
        };

        return (
          <div key={p.id} className={styles.fallTrack} style={fallStyle}>
            <span className={styles.swayTrack} style={swayStyle}>
              <RainGlyph
                kind={p.kind}
                petalGradId={petalGradId}
                centerGradId={centerGradId}
                tumbleStyle={tumbleStyle}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
