'use client';

import styles from './pos-capy-charge-particles.module.css';

interface CapyBtnParticle {
  id: number;
  kind: 'capy' | 'leaf' | 'yuzu' | 'lotus';
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  rotStart: string;
   swayX: string;
  riseY: string;
  opacity: number;
}

const BUTTON_PARTICLES: CapyBtnParticle[] = [
  {
    id: 1,
    kind: 'capy',
    left: '6%',
    top: '62%',
    size: 16,
    delay: '0s',
    duration: '6.2s',
    rotStart: '-10deg',
    swayX: '11px',
    riseY: '-20px',
    opacity: 0.9,
  },
  {
    id: 2,
    kind: 'leaf',
    left: '17%',
    top: '74%',
    size: 13,
    delay: '-1.5s',
    duration: '5.5s',
    rotStart: '18deg',
    swayX: '-9px',
    riseY: '-22px',
    opacity: 0.86,
  },
  {
    id: 3,
    kind: 'yuzu',
    left: '29%',
    top: '68%',
    size: 12,
    delay: '-3.1s',
    duration: '6.0s',
    rotStart: '-8deg',
    swayX: '8px',
    riseY: '-19px',
    opacity: 0.88,
  },
  {
    id: 4,
    kind: 'lotus',
    left: '43%',
    top: '76%',
    size: 13,
    delay: '-2.2s',
    duration: '5.8s',
    rotStart: '12deg',
    swayX: '-10px',
    riseY: '-21px',
    opacity: 0.84,
  },
  {
    id: 5,
    kind: 'capy',
    left: '58%',
    top: '70%',
    size: 15,
    delay: '-4.0s',
    duration: '6.5s',
    rotStart: '9deg',
    swayX: '10px',
    riseY: '-20px',
    opacity: 0.88,
  },
  {
    id: 6,
    kind: 'leaf',
    left: '72%',
    top: '64%',
    size: 13,
    delay: '-0.9s',
    duration: '5.6s',
    rotStart: '-16deg',
    swayX: '-11px',
    riseY: '-19px',
    opacity: 0.86,
  },
  {
    id: 7,
    kind: 'yuzu',
    left: '84%',
    top: '72%',
    size: 12,
    delay: '-2.7s',
    duration: '6.1s',
    rotStart: '14deg',
    swayX: '9px',
    riseY: '-22px',
    opacity: 0.9,
  },
  {
    id: 8,
    kind: 'lotus',
    left: '92%',
    top: '60%',
    size: 12,
    delay: '-3.6s',
    duration: '5.4s',
    rotStart: '-12deg',
    swayX: '-8px',
    riseY: '-18px',
    opacity: 0.84,
  },
];

const GLINT_DOTS = [
  { id: 1, left: '13%', top: '30%', delay: '0s' },
  { id: 2, left: '36%', top: '24%', delay: '-1.3s' },
  { id: 3, left: '66%', top: '28%', delay: '-2.5s' },
  { id: 4, left: '88%', top: '34%', delay: '-0.8s' },
];

function CapyMiniSvg({ id }: { id: number }) {
  const gradId = `capyBtnHead_${id}`;
  return (
    <svg viewBox="0 0 36 36" className={styles.svgIcon}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d9a16c" />
          <stop offset="60%" stopColor="#bd814c" />
          <stop offset="100%" stopColor="#9c6434" />
        </linearGradient>
      </defs>
      {/* Tiny orange yuzu on head */}
      <circle cx="18" cy="7.5" r="4.5" fill="#fb923c" stroke="#fff7ed" strokeWidth="0.9" />
      <ellipse cx="16.8" cy="6.2" rx="1.4" ry="0.9" fill="#fed7aa" opacity="0.85" />
      <path d="M18 3 C20 1.2, 22.8 1.8, 22.2 3.8 C20.8 4.4, 19 4, 18 3 Z" fill="#86efac" />
      {/* Capybara rounded ears */}
      <ellipse cx="9.5" cy="13.5" rx="3.2" ry="2.4" transform="rotate(-24 9.5 13.5)" fill="#855127" />
      <ellipse cx="26.5" cy="13.5" rx="3.2" ry="2.4" transform="rotate(24 26.5 13.5)" fill="#855127" />
      {/* Capybara chubby head */}
      <rect x="6.5" y="11" width="23" height="18.5" rx="9.2" fill={`url(#${gradId})`} stroke="#fffbeb" strokeWidth="1.1" />
      {/* Darker snout muzzle patch */}
      <rect x="12.5" y="16.5" width="11" height="10" rx="5" fill="#935b2e" opacity="0.82" />
      {/* Peaceful closed eyes */}
      <path d="M9.5 17.5 Q11 16.5 12.2 17.5" fill="none" stroke="#3e220c" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M23.8 17.5 Q25 16.5 26.5 17.5" fill="none" stroke="#3e220c" strokeWidth="1.3" strokeLinecap="round" />
      {/* Rosy cheeks */}
      <ellipse cx="9.5" cy="20.5" rx="1.8" ry="1.1" fill="#fda4af" opacity="0.65" />
      <ellipse cx="26.5" cy="20.5" rx="1.8" ry="1.1" fill="#fda4af" opacity="0.65" />
      {/* Nostrils & mouth */}
      <circle cx="16" cy="19.5" r="0.9" fill="#3e220c" />
      <circle cx="20" cy="19.5" r="0.9" fill="#3e220c" />
      <path d="M18 20.5 L18 23 M16.2 23.5 Q18 24.8 19.8 23.5" fill="none" stroke="#3e220c" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function MatchaLeafSvg({ id }: { id: number }) {
  const gradId = `capyBtnLeaf_${id}`;
  return (
    <svg viewBox="0 0 32 32" className={styles.svgIcon}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ecfccb" />
          <stop offset="50%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <path
        d="M6 26 C6 13, 15 5, 27 5 C27 17, 19 26, 6 26 Z"
        fill={`url(#${gradId})`}
        stroke="#ffffff"
        strokeWidth="1"
      />
      <path
        d="M6 26 Q15 17 25 7"
        fill="none"
        stroke="#166534"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M12 20 L12 15 M17 15 L17 11"
        fill="none"
        stroke="#166534"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

function YuzuMiniSvg({ id }: { id: number }) {
  const gradId = `capyBtnYuzu_${id}`;
  return (
    <svg viewBox="0 0 32 32" className={styles.svgIcon}>
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </radialGradient>
      </defs>
      <ellipse cx="16" cy="17.5" rx="10.5" ry="9.2" fill={`url(#${gradId})`} stroke="#fffbeb" strokeWidth="1.1" />
      <ellipse cx="12.5" cy="14" rx="3" ry="1.8" transform="rotate(-20 12.5 14)" fill="#ffffff" opacity="0.55" />
      <path d="M16 8.5 C19 4.5, 24 5.5, 23 9 C20.5 10, 18 9.5, 16 8.5 Z" fill="#bbf7d0" stroke="#166534" strokeWidth="0.7" />
    </svg>
  );
}

function LotusMiniSvg() {
  return (
    <svg viewBox="0 0 32 32" className={styles.svgIcon}>
      <path d="M16 5 C19.5 11, 19.5 18, 16 23 C12.5 18, 12.5 11, 16 5 Z" fill="#ffffff" opacity="0.92" />
      <path d="M16 23 C10 21, 6 16, 7 10 C12 12, 15 17, 16 23 Z" fill="#dcfce7" opacity="0.88" />
      <path d="M16 23 C22 21, 26 16, 25 10 C20 12, 17 17, 16 23 Z" fill="#dcfce7" opacity="0.88" />
      <circle cx="16" cy="16.5" r="2.2" fill="#fde047" />
    </svg>
  );
}

export default function PosCapyChargeParticles() {
  return (
    <span className={styles.particleLayer} aria-hidden="true">
      {BUTTON_PARTICLES.map(p => (
        <span
          key={p.id}
          className={styles.particle}
          style={
            {
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: p.delay,
              animationDuration: p.duration,
              '--capy-rot': p.rotStart,
              '--capy-sway': p.swayX,
              '--capy-rise': p.riseY,
              '--capy-opacity': p.opacity,
            } as React.CSSProperties
          }
        >
          {p.kind === 'capy' && <CapyMiniSvg id={p.id} />}
          {p.kind === 'leaf' && <MatchaLeafSvg id={p.id} />}
          {p.kind === 'yuzu' && <YuzuMiniSvg id={p.id} />}
          {p.kind === 'lotus' && <LotusMiniSvg />}
        </span>
      ))}
      {GLINT_DOTS.map(g => (
        <span
          key={g.id}
          className={styles.glint}
          style={{
            left: g.left,
            top: g.top,
            animationDelay: g.delay,
          }}
        />
      ))}
    </span>
  );
}
