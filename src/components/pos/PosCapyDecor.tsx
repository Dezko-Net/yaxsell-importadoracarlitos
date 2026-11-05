'use client';

import styles from './pos-capy-decor.module.css';

interface CapyAmbientNode {
  id: number;
  kind: 'capy' | 'leaf' | 'yuzu' | 'flower';
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  driftX: string;
  driftY: string;
  rotStart: string;
  rotEnd: string;
  opacity: number;
}

const CART_AMBIENT_NODES: CapyAmbientNode[] = [
  {
    id: 1,
    kind: 'capy',
    left: '6%',
    top: '8%',
    size: 28,
    delay: '0s',
    duration: '12s',
    driftX: '14px',
    driftY: '-14px',
    rotStart: '-10deg',
    rotEnd: '12deg',
    opacity: 0.42,
  },
  {
    id: 2,
    kind: 'leaf',
    left: '82%',
    top: '11%',
    size: 22,
    delay: '-2.4s',
    duration: '10.5s',
    driftX: '-16px',
    driftY: '12px',
    rotStart: '15deg',
    rotEnd: '-14deg',
    opacity: 0.44,
  },
  {
    id: 3,
    kind: 'yuzu',
    left: '16%',
    top: '27%',
    size: 20,
    delay: '-4.2s',
    duration: '11.4s',
    driftX: '12px',
    driftY: '15px',
    rotStart: '-12deg',
    rotEnd: '16deg',
    opacity: 0.4,
  },
  {
    id: 4,
    kind: 'flower',
    left: '74%',
    top: '31%',
    size: 22,
    delay: '-1.5s',
    duration: '13s',
    driftX: '-14px',
    driftY: '-12px',
    rotStart: '0deg',
    rotEnd: '40deg',
    opacity: 0.42,
  },
  {
    id: 5,
    kind: 'leaf',
    left: '9%',
    top: '51%',
    size: 21,
    delay: '-5.8s',
    duration: '10.8s',
    driftX: '15px',
    driftY: '-13px',
    rotStart: '-18deg',
    rotEnd: '14deg',
    opacity: 0.4,
  },
  {
    id: 6,
    kind: 'capy',
    left: '84%',
    top: '54%',
    size: 26,
    delay: '-3.3s',
    duration: '12.6s',
    driftX: '-15px',
    driftY: '14px',
    rotStart: '8deg',
    rotEnd: '-12deg',
    opacity: 0.38,
  },
  {
    id: 7,
    kind: 'yuzu',
    left: '20%',
    top: '73%',
    size: 19,
    delay: '-6.5s',
    duration: '11.2s',
    driftX: '12px',
    driftY: '-14px',
    rotStart: '-14deg',
    rotEnd: '12deg',
    opacity: 0.4,
  },
  {
    id: 8,
    kind: 'flower',
    left: '78%',
    top: '78%',
    size: 21,
    delay: '-2.1s',
    duration: '11.8s',
    driftX: '-13px',
    driftY: '-13px',
    rotStart: '12deg',
    rotEnd: '-16deg',
    opacity: 0.42,
  },
  {
    id: 9,
    kind: 'leaf',
    left: '48%',
    top: '16%',
    size: 18,
    delay: '-4.9s',
    duration: '10.2s',
    driftX: '10px',
    driftY: '12px',
    rotStart: '-15deg',
    rotEnd: '15deg',
    opacity: 0.35,
  },
  {
    id: 10,
    kind: 'yuzu',
    left: '52%',
    top: '85%',
    size: 18,
    delay: '-1.2s',
    duration: '12.2s',
    driftX: '-11px',
    driftY: '-11px',
    rotStart: '10deg',
    rotEnd: '-10deg',
    opacity: 0.36,
  },
];

const MODAL_AMBIENT_NODES: CapyAmbientNode[] = CART_AMBIENT_NODES.slice(0, 6).map(item => ({
  ...item,
  opacity: 0.32,
}));

function AmbientCapySvg() {
  return (
    <svg viewBox="0 0 40 40" className={styles.ambientSvg}>
      <circle cx="20" cy="8.5" r="4.8" fill="#fb923c" />
      <path d="M20 3.7 C22 1.8, 25 2.4, 24.4 4.6 C22.8 5.2, 21.2 4.8, 20 3.7 Z" fill="#4ade80" />
      <ellipse cx="11" cy="15" rx="3.4" ry="2.4" transform="rotate(-24 11 15)" fill="#854d27" />
      <ellipse cx="29" cy="15" rx="3.4" ry="2.4" transform="rotate(24 29 15)" fill="#854d27" />
      <rect x="7.5" y="12.5" width="25" height="20" rx="10" fill="#c98e58" />
      <rect x="14" y="18" width="12" height="10.5" rx="5.2" fill="#9a6032" opacity="0.85" />
      <path d="M11 19.5 Q12.5 18.4 14 19.5" fill="none" stroke="#43230c" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M26 19.5 Q27.5 18.4 29 19.5" fill="none" stroke="#43230c" strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="11" cy="22.5" rx="2" ry="1.1" fill="#fb7185" opacity="0.55" />
      <ellipse cx="29" cy="22.5" rx="2" ry="1.1" fill="#fb7185" opacity="0.55" />
    </svg>
  );
}

function AmbientLeafSvg() {
  return (
    <svg viewBox="0 0 32 32" className={styles.ambientSvg}>
      <path d="M5 27 C5 14, 14 5, 27 5 C27 18, 18 27, 5 27 Z" fill="#6ee7b7" />
      <path d="M5 27 Q15 17 25 7" fill="none" stroke="#15803d" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function AmbientYuzuSvg() {
  return (
    <svg viewBox="0 0 32 32" className={styles.ambientSvg}>
      <ellipse cx="16" cy="17.5" rx="10" ry="8.8" fill="#fb923c" />
      <ellipse cx="12.8" cy="14.2" rx="2.8" ry="1.6" transform="rotate(-18 12.8 14.2)" fill="#ffedd5" opacity="0.65" />
      <path d="M16 8.6 C18.8 4.8, 23.5 5.6, 22.6 9 C20.2 9.8, 17.8 9.4, 16 8.6 Z" fill="#4ade80" />
    </svg>
  );
}

function AmbientTeaBlossomSvg() {
  return (
    <svg viewBox="0 0 32 32" className={styles.ambientSvg}>
      <circle cx="16" cy="9" r="5" fill="#ffffff" />
      <circle cx="22.5" cy="13.8" r="5" fill="#ecfccb" />
      <circle cx="20" cy="21.5" r="5" fill="#ffffff" />
      <circle cx="12" cy="21.5" r="5" fill="#ecfccb" />
      <circle cx="9.5" cy="13.8" r="5" fill="#ffffff" />
      <circle cx="16" cy="16" r="3.6" fill="#facc15" />
    </svg>
  );
}

export function PosCapyAmbientField({ variant = 'cart' }: { variant?: 'cart' | 'modal' }) {
  const nodes = variant === 'modal' ? MODAL_AMBIENT_NODES : CART_AMBIENT_NODES;
  return (
    <div
      className={`${styles.ambientContainer} ${
        variant === 'modal' ? styles.ambientModal : styles.ambientCart
      }`}
      aria-hidden="true"
    >
      {nodes.map(node => (
        <span
          key={node.id}
          className={styles.ambientItem}
          style={
            {
              left: node.left,
              top: node.top,
              width: `${node.size}px`,
              height: `${node.size}px`,
              animationDelay: node.delay,
              animationDuration: node.duration,
              '--capy-drift-x': node.driftX,
              '--capy-drift-y': node.driftY,
              '--capy-rot-start': node.rotStart,
              '--capy-rot-end': node.rotEnd,
              '--capy-amb-opacity': node.opacity,
            } as React.CSSProperties
          }
        >
          {node.kind === 'capy' && <AmbientCapySvg />}
          {node.kind === 'leaf' && <AmbientLeafSvg />}
          {node.kind === 'yuzu' && <AmbientYuzuSvg />}
          {node.kind === 'flower' && <AmbientTeaBlossomSvg />}
        </span>
      ))}
    </div>
  );
}

/**
 * Floating Matcha Leaf / Yuzu helper that separates SVG coordinate transform (`<g transform>`)
 * from CSS keyframe animation (`<g className>`) so elements never stack at (0,0).
 */
function CapyFloatingLeaf({
  x,
  y,
  rotate,
  scale = 1,
  className,
}: {
  x: number;
  y: number;
  rotate: number;
  scale?: number;
  className?: string;
}) {
  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotate}) scale(${scale})`}>
      <g className={className}>
        <path
          d="M-11 4 C-7 -7, 4 -10, 13 -4 C7 6, -3 9, -11 4 Z"
          fill="#6ee7b7"
          stroke="#227046"
          strokeWidth="1"
        />
        <path
          d="M-9 3 Q1 -1 11 -3"
          fill="none"
          stroke="#166534"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.65"
        />
      </g>
    </g>
  );
}

function CapyFloatingYuzu({
  x,
  y,
  rotate,
  scale = 1,
  className,
}: {
  x: number;
  y: number;
  rotate: number;
  scale?: number;
  className?: string;
}) {
  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotate}) scale(${scale})`}>
      <g className={className}>
        <ellipse cx="0" cy="1" rx="8.5" ry="7.2" fill="#fb923c" stroke="#9a3412" strokeWidth="1" />
        <ellipse cx="-2.8" cy="-1.5" rx="2.5" ry="1.4" transform="rotate(-18 -2.8 -1.5)" fill="#ffedd5" opacity="0.75" />
        <path d="M0 -6.2 C2.6 -9.5, 6.8 -8.6, 6 -5.5 C3.8 -4.8, 1.8 -5.2, 0 -6.2 Z" fill="#4ade80" stroke="#14532d" strokeWidth="0.8" />
      </g>
    </g>
  );
}

export function PosCapySearchEmptyHero() {
  return (
    <div className={styles.heroWrap}>
      <div className={styles.heroCard}>
        {/* Top Bamboo & Yuzu Ribbon */}
        <svg viewBox="0 0 180 42" className={styles.heroRibbonSvg} aria-hidden="true">
          <path
            d="M36 22 C18 12, 8 18, 16 28 C24 36, 44 30, 56 24"
            fill="#bbf7d0"
            stroke="#52946b"
            strokeWidth="1.2"
          />
          <path
            d="M144 22 C162 12, 172 18, 164 28 C156 36, 136 30, 124 24"
            fill="#bbf7d0"
            stroke="#52946b"
            strokeWidth="1.2"
          />
          <path
            d="M52 20 C36 6, 30 28, 54 28 C66 28, 78 24, 90 21 Z"
            fill="#86efac"
            stroke="#3d7a55"
            strokeWidth="1.2"
          />
          <path
            d="M128 20 C144 6, 150 28, 126 28 C114 28, 102 24, 90 21 Z"
            fill="#86efac"
            stroke="#3d7a55"
            strokeWidth="1.2"
          />
          {/* Center Golden Yuzu Medallion */}
          <circle cx="90" cy="21" r="9.5" fill="#fb923c" stroke="#9a3412" strokeWidth="1.3" />
          <ellipse cx="87.2" cy="18.2" rx="2.6" ry="1.5" fill="#ffedd5" opacity="0.85" />
          <path d="M90 11.5 C93 8, 98 9, 97 12.6 C94.5 13.4, 92 12.8, 90 11.5 Z" fill="#4ade80" stroke="#14532d" strokeWidth="0.9" />
        </svg>

        {/* Central Illustration: Capybara in Wooden Hinoki Onsen with Mandarin on Head + Scanner */}
        <div className={styles.heroArtStage} aria-hidden="true">
          <svg viewBox="0 0 220 154" className={styles.heroArtSvg}>
            <defs>
              <radialGradient id="capyHeroAura" cx="50%" cy="52%" r="50%">
                <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.95" />
                <stop offset="65%" stopColor="#ecfccb" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#f0fdf4" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="capyBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#dfa872" />
                <stop offset="55%" stopColor="#c68a53" />
                <stop offset="100%" stopColor="#a36936" />
              </linearGradient>
              <linearGradient id="hinokiWoodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffdeba" />
                <stop offset="50%" stopColor="#f3c592" />
                <stop offset="100%" stopColor="#dda46c" />
              </linearGradient>
            </defs>

            {/* Soft Matcha Aura Circle */}
            <circle cx="110" cy="80" r="64" fill="url(#capyHeroAura)" />
            <circle
              cx="110"
              cy="80"
              r="57"
              fill="none"
              stroke="#86efac"
              strokeWidth="1.3"
              strokeDasharray="4 4"
            />

            {/* Well-separated Floating Matcha Leaves & Yuzu Fruits */}
            <CapyFloatingLeaf x={26} y={36} rotate={-22} scale={0.92} className={styles.floatA} />
            <CapyFloatingYuzu x={24} y={92} rotate={14} scale={0.85} className={styles.floatB} />
            <CapyFloatingLeaf x={194} y={44} rotate={26} scale={0.88} className={styles.floatB} />
            <CapyFloatingYuzu x={190} y={102} rotate={-16} scale={0.82} className={styles.floatA} />

            {/* Rising Onsen Steam Curls */}
            <path
              className={styles.steamCurlA}
              d="M62 72 Q58 62 63 54 T61 38"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.82"
            />
            <path
              className={styles.steamCurlB}
              d="M158 68 Q163 58 157 50 T160 34"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.82"
            />

            {/* Capybara Animated Group */}
            <g className={styles.capyBobGroup}>
              {/* Orange Yuzu / Mandarin on top of Capybara's Head */}
              <g className={styles.yuzuWobble}>
                <ellipse cx="110" cy="30" rx="11.5" ry="9.5" fill="#fb923c" stroke="#9a3412" strokeWidth="1.4" />
                <ellipse cx="106" cy="26.5" rx="3.4" ry="1.9" transform="rotate(-18 106 26.5)" fill="#ffedd5" opacity="0.85" />
                <path
                  d="M110 20.5 C114 15, 121 16.5, 119.5 21 C116 22.2, 112.5 21.8, 110 20.5 Z"
                  fill="#4ade80"
                  stroke="#14532d"
                  strokeWidth="1.1"
                />
              </g>

              {/* Capybara Rounded Ears */}
              <ellipse
                cx="82"
                cy="45"
                rx="6.5"
                ry="4.8"
                transform="rotate(-28 82 45)"
                fill="#854d27"
                stroke="#5c3418"
                strokeWidth="1.4"
              />
              <ellipse
                cx="138"
                cy="45"
                rx="6.5"
                ry="4.8"
                transform="rotate(28 138 45)"
                fill="#854d27"
                stroke="#5c3418"
                strokeWidth="1.4"
              />

              {/* Capybara Head & Shoulders */}
              <path
                d="M72 95 C72 64, 78 39, 110 39 C142 39, 148 64, 148 95 Z"
                fill="url(#capyBodyGrad)"
                stroke="#5c3418"
                strokeWidth="1.6"
              />

              {/* Capybara Snout Patch */}
              <rect
                x="96"
                y="51"
                width="28"
                height="24"
                rx="11"
                fill="#965d30"
                stroke="#6b3e1b"
                strokeWidth="1.1"
              />

              {/* Peaceful Happy Eyes */}
              <path
                d="M83 56 Q87.5 53 92 56"
                fill="none"
                stroke="#3b1f0b"
                strokeWidth="2.1"
                strokeLinecap="round"
              />
              <path
                d="M128 56 Q132.5 53 137 56"
                fill="none"
                stroke="#3b1f0b"
                strokeWidth="2.1"
                strokeLinecap="round"
              />

              {/* Rosy Cheeks */}
              <ellipse cx="83" cy="63" rx="4.5" ry="2.4" fill="#fb7185" opacity="0.6" />
              <ellipse cx="137" cy="63" rx="4.5" ry="2.4" fill="#fb7185" opacity="0.6" />

              {/* Nostrils & Gentle Smile */}
              <ellipse cx="105" cy="59" rx="1.8" ry="2.2" fill="#3b1f0b" />
              <ellipse cx="115" cy="59" rx="1.8" ry="2.2" fill="#3b1f0b" />
              <path
                d="M110 62 L110 68 M104.5 68.5 Q110 72.5 115.5 68.5"
                fill="none"
                stroke="#3b1f0b"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </g>

            {/* Wooden Hinoki Onsen Tub & Matcha Water */}
            <ellipse
              cx="110"
              cy="95"
              rx="52"
              ry="10"
              fill="#a7f3d0"
              stroke="#5c3418"
              strokeWidth="1.4"
            />
            {/* Water ripples */}
            <path
              d="M74 95 Q92 99 110 95 T146 95"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* Wooden tub body */}
            <path
              d="M58 95 L63 130 C65 138, 155 138, 157 130 L162 95 C145 103, 75 103, 58 95 Z"
              fill="url(#hinokiWoodGrad)"
              stroke="#784721"
              strokeWidth="1.6"
            />
            {/* Wooden tub vertical staves & copper bands */}
            <line x1="82" y1="100" x2="84" y2="134" stroke="#b07543" strokeWidth="1.2" />
            <line x1="110" y1="101" x2="110" y2="136" stroke="#b07543" strokeWidth="1.2" />
            <line x1="138" y1="100" x2="136" y2="134" stroke="#b07543" strokeWidth="1.2" />
            <path
              d="M60 110 Q110 117 160 110"
              fill="none"
              stroke="#8c5327"
              strokeWidth="2.2"
            />
            <path
              d="M62 123 Q110 130 158 123"
              fill="none"
              stroke="#8c5327"
              strokeWidth="2.2"
            />

            {/* Barcode Badge on Front of Wooden Tub */}
            <rect
              x="86"
              y="107"
              width="48"
              height="20"
              rx="6"
              fill="#fffef9"
              stroke="#52946b"
              strokeWidth="1.3"
            />
            <g stroke="#28593a" strokeLinecap="round">
              <line x1="94" y1="111" x2="94" y2="123" strokeWidth="1.8" />
              <line x1="98" y1="111" x2="98" y2="123" strokeWidth="1" />
              <line x1="102" y1="111" x2="102" y2="123" strokeWidth="2.2" />
              <line x1="107" y1="111" x2="107" y2="123" strokeWidth="1.1" />
              <line x1="111" y1="111" x2="111" y2="123" strokeWidth="1.8" />
              <line x1="116" y1="111" x2="116" y2="123" strokeWidth="1" />
              <line x1="120" y1="111" x2="120" y2="123" strokeWidth="2.2" />
              <line x1="125" y1="111" x2="125" y2="123" strokeWidth="1.3" />
            </g>
            {/* Laser scan line */}
            <line
              x1="90"
              y1="117"
              x2="130"
              y2="117"
              stroke="#22c55e"
              strokeWidth="1.6"
              strokeLinecap="round"
            />

            {/* Capybara Front Paws Resting on the Rim of the Tub */}
            <ellipse cx="80" cy="96" rx="7.5" ry="5" fill="#9c6334" stroke="#5c3418" strokeWidth="1.3" />
            <ellipse cx="140" cy="96" rx="7.5" ry="5" fill="#9c6334" stroke="#5c3418" strokeWidth="1.3" />

            {/* Frothy Matcha Bowl on the Right Side */}
            <g transform="translate(166, 114)">
              <path
                d="M-12 0 L-10 13 C-8 18, 8 18, 10 13 L12 0 Z"
                fill="#e7dec8"
                stroke="#6b5b45"
                strokeWidth="1.3"
              />
              <ellipse cx="0" cy="0" rx="12" ry="4" fill="#86efac" stroke="#6b5b45" strokeWidth="1.2" />
              <ellipse cx="0" cy="0" rx="7.5" ry="2.2" fill="#dcfce7" opacity="0.85" />
            </g>
          </svg>
        </div>

        {/* Typography */}
        <span className={styles.heroEyebrow}>茶 · Capybara Onsen &amp; Matcha</span>
        <h3 className={styles.heroTitle}>Una venta empieza aqu&iacute;</h3>
        <p className={styles.heroSubtitle}>
          Busca por nombre o escanea un c&oacute;digo. <strong>Enter</strong> agrega una coincidencia exacta al instante con toda la calma del capibara.
        </p>

        {/* Feature Pills */}
        <div className={styles.heroPills}>
          <span className={styles.heroPill}>🍊 Capy Scanner Ready</span>
          <span className={styles.heroPill}>🍵 Paz Matcha Instant&aacute;nea</span>
        </div>
      </div>
    </div>
  );
}

export function PosCapyCartEmptyArt() {
  return (
    <div className={styles.cartEmptyWrap}>
      <svg viewBox="0 0 136 104" className={styles.cartEmptySvg} aria-hidden="true">
        {/* Bamboo tatami mat */}
        <ellipse cx="68" cy="78" rx="48" ry="13" fill="#d9f0d6" stroke="#68a87b" strokeWidth="1.4" strokeDasharray="4 3" />
        {/* Sleeping Capybara body */}
        <path
          d="M32 76 C30 52, 54 44, 78 48 C96 50, 104 62, 102 76 Z"
          fill="#c98e58"
          stroke="#5c3418"
          strokeWidth="1.5"
        />
        {/* Capybara head resting */}
        <rect x="26" y="48" width="34" height="26" rx="12" fill="#d59b65" stroke="#5c3418" strokeWidth="1.5" />
        <rect x="24" y="56" width="15" height="14" rx="6.5" fill="#9a6032" />
        {/* Closed sleeping eye */}
        <path d="M44 58 Q47 56 50 58" fill="none" stroke="#3b1f0b" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="47" cy="63" rx="3" ry="1.6" fill="#fb7185" opacity="0.6" />
        {/* Ear */}
        <ellipse cx="52" cy="48" rx="4.5" ry="3.2" transform="rotate(20 52 48)" fill="#854d27" stroke="#5c3418" strokeWidth="1.2" />
        {/* Tiny yuzu balanced on back/head */}
        <circle cx="42" cy="42" r="6.5" fill="#fb923c" stroke="#9a3412" strokeWidth="1.2" />
        <path d="M42 35.5 C44.5 32.5, 48.5 33.2, 47.8 36 C45.8 36.8, 43.8 36.4, 42 35.5 Z" fill="#4ade80" stroke="#14532d" strokeWidth="0.9" />
        {/* Matcha cup beside capybara */}
        <path d="M90 66 L92 78 C93 81, 105 81, 106 78 L108 66 Z" fill="#f5efe0" stroke="#6b5b45" strokeWidth="1.2" />
        <ellipse cx="99" cy="66" rx="9" ry="3" fill="#6ee7b7" stroke="#6b5b45" strokeWidth="1.1" />
      </svg>
      <span className={styles.cartEmptyTitle}>Canasta Matcha vac&iacute;a</span>
      <span className={styles.cartEmptyText}>
        Escanea o elige productos para despertar al capibara
      </span>
    </div>
  );
}

export function PosCapyCheckMedallion() {
  return (
    <div className={styles.medallionWrap} aria-hidden="true">
      <svg viewBox="0 0 58 58" className={styles.medallionSvg}>
        {/* Capybara rounded ears */}
        <ellipse cx="14" cy="17" rx="6" ry="4.4" transform="rotate(-28 14 17)" fill="#854d27" stroke="#5c3418" strokeWidth="1.3" />
        <ellipse cx="44" cy="17" rx="6" ry="4.4" transform="rotate(28 44 17)" fill="#854d27" stroke="#5c3418" strokeWidth="1.3" />
        {/* Tiny orange yuzu on top */}
        <circle cx="29" cy="9" r="5.5" fill="#fb923c" stroke="#9a3412" strokeWidth="1.2" />
        <path d="M29 3.5 C31.5 1, 35 1.8, 34.2 4.4 C32.2 5, 30.5 4.5, 29 3.5 Z" fill="#4ade80" stroke="#14532d" strokeWidth="0.8" />
        {/* Matcha Medallion Circle */}
        <circle cx="29" cy="32" r="20" fill="#4b8f63" stroke="#ffffff" strokeWidth="2.5" />
        <circle cx="29" cy="32" r="16.5" fill="none" stroke="#bbf7d0" strokeWidth="1" strokeDasharray="3 3" />
        {/* Crisp Checkmark */}
        <path
          d="M21.5 32.5 L26.8 37.8 L37 26.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function PosCapyModalHeaderArt() {
  return (
    <svg viewBox="0 0 440 94" className={styles.modalHeaderSvg} aria-hidden="true">
      {/* Soft bamboo & yuzu garland across top */}
      <path
        d="M0 16 Q110 34 220 14 T440 22"
        fill="none"
        stroke="#86efac"
        strokeWidth="1.4"
        strokeDasharray="4 4"
        opacity="0.7"
      />
      {/* Peeking capybara on right */}
      <g transform="translate(338, 18)">
        <circle cx="24" cy="6" r="5" fill="#fb923c" opacity="0.85" />
        <path d="M24 1 C26.5 -1, 29.5 -0.4, 28.8 2 C27 2.6, 25.4 2.2, 24 1 Z" fill="#4ade80" opacity="0.85" />
        <ellipse cx="13" cy="13" rx="4" ry="2.8" transform="rotate(-25 13 13)" fill="#854d27" opacity="0.75" />
        <ellipse cx="35" cy="13" rx="4" ry="2.8" transform="rotate(25 35 13)" fill="#854d27" opacity="0.75" />
        <rect x="9" y="10" width="30" height="24" rx="11" fill="#c98e58" opacity="0.78" />
        <rect x="17" y="16" width="14" height="12" rx="6" fill="#9a6032" opacity="0.75" />
        <path d="M13 18 Q15 16.5 17 18" fill="none" stroke="#3b1f0b" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M31 18 Q33 16.5 35 18" fill="none" stroke="#3b1f0b" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
