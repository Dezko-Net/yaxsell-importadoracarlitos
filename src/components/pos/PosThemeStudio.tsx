'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Maximize2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  DEFAULT_POS_PERSONAL_THEME,
  POS_ACCENT_PALETTES,
  POS_NEKO_CAT_DESIGNS,
  POS_NEKO_THEME_COLOR_DEFAULTS,
  POS_THEME_PRESETS,
  getPosNekoCatColors,
  isPosNekoTheme,
  presetToPersonalTheme,
  type PosNekoCatColors,
  type PosNekoColorKey,
  type PosNekoDesign,
  type PosNekoThemeColors,
  type PosCardFinish,
  type PosFontStyle,
  type PosPatternId,
  type PosPersonalTheme,
  type PosShapeStyle,
  type PosSurfaceMode,
  type PosThemeCustomColors,
  type PosThemePreset,
} from './posThemes';
import {
  cacheCapyWallpaper,
  cacheJasmineWallpaper,
  cacheNekoWallpaper,
  cacheSakuraWallpaper,
} from './posWallpaperCache';
import styles from './pos-theme-studio.module.css';

interface ThemeVisualMeta {
  wallpaperUrl?: string;
  wallpaperPosition?: string;
  stageBackgroundImage?: string;
  stageBackgroundSize?: string;
  canvasBg: string;
  glassPanelBg: string;
  glassBorder: string;
  ctaGradient: string;
  ctaShadow: string;
  accentPillBg: string;
  accentPillText: string;
  accentPillBorder: string;
  features: string[];
}

const THEME_VISUAL_META: Record<string, ThemeVisualMeta> = {
  'sakura-coquette': {
    wallpaperUrl: '/pos/wallpapers/sakura-bloom-bokeh.jpg',
    canvasBg: '#f6cad8',
    glassPanelBg: 'rgba(255, 248, 252, 0.84)',
    glassBorder: '1.5px dashed #f29ec0',
    ctaGradient: 'linear-gradient(125deg, #db6590 0%, #e77ba2 50%, #d8608c 100%)',
    ctaShadow: '0 4px 12px rgba(196, 86, 128, 0.25)',
    accentPillBg: '#fff0f6',
    accentPillText: '#b83268',
    accentPillBorder: '#f7b2ce',
    features: ['🌸 Fondo Sakura HD', '✨ Lluvia de Pétalos', '🎀 Cristal Coquette'],
  },
  'neko-mikan': {
    wallpaperUrl: '/pos/wallpapers/neko-mikan-hd.jpg',
    canvasBg: '#fad5ad',
    glassPanelBg: 'rgba(255, 250, 244, 0.84)',
    glassBorder: '1.5px dashed #f2a76b',
    ctaGradient: 'linear-gradient(125deg, #df7229 0%, #ed8b42 50%, #d86920 100%)',
    ctaShadow: '0 4px 12px rgba(196, 94, 28, 0.25)',
    accentPillBg: '#fff4e8',
    accentPillText: '#b45314',
    accentPillBorder: '#f6bd8e',
    features: ['🐱 Fondo Cat Café HD', '🐾 Lluvia de Michis', '🔔 Botón con Cascabeles'],
  },
  'neko-nocturno': {
    wallpaperUrl: '/pos/wallpapers/neko-fernanda-hd.jpg',
    wallpaperPosition: 'center center',
    canvasBg: '#1e2f4d',
    glassPanelBg: 'rgba(248, 251, 255, 0.86)',
    glassBorder: '1.5px dashed #e11d48',
    ctaGradient: 'linear-gradient(125deg, #b91f3d 0%, #e43d58 55%, #982037 100%)',
    ctaShadow: '0 4px 14px rgba(185, 31, 61, 0.30)',
    accentPillBg: '#fff1f3',
    accentPillText: '#9f1239',
    accentPillBorder: '#ef9baa',
    features: ['🐈 Michi de Fernanda HD', '🌙 Luna & Faroles', '🐾 Lluvia Gatuna Nocturna'],
  },
  'jasmine-lavender': {
    wallpaperUrl: '/pos/wallpapers/jasmine-agrabah-hd.jpg',
    canvasBg: '#ccf2f0',
    glassPanelBg: 'rgba(247, 254, 253, 0.86)',
    glassBorder: '1.5px dashed #4fd1c5',
    ctaGradient: 'linear-gradient(125deg, #139a93 0%, #26b8ae 52%, #0e8b85 100%)',
    ctaShadow: '0 4px 12px rgba(15, 150, 144, 0.25)',
    accentPillBg: '#e6fcf9',
    accentPillText: '#0d6b66',
    accentPillBorder: '#67e0d6',
    features: ['🧞‍♂️ Fondo Agrabah HD', '💎 Lluvia de Joyas', '🪔 Lámpara Mágica'],
  },
  'capy-matcha': {
    wallpaperUrl: '/pos/wallpapers/capy-matcha-hd.jpg',
    canvasBg: '#d5e5cb',
    glassPanelBg: 'rgba(248, 253, 249, 0.84)',
    glassBorder: '1.5px dashed #7bc494',
    ctaGradient: 'linear-gradient(125deg, #4b8f63 0%, #63aa7b 50%, #428359 100%)',
    ctaShadow: '0 4px 12px rgba(45, 106, 79, 0.24)',
    accentPillBg: '#eefaf1',
    accentPillText: '#25663e',
    accentPillBorder: '#97d4ab',
    features: ['🍊 Capibara & Yuzu HD', '🍵 Lluvia Matcha Onsen', '🎋 Cristal Bambú'],
  },
  'asistora-original': {
    canvasBg: '#e9f2ee',
    glassPanelBg: '#ffffff',
    glassBorder: '1.5px solid #cfe0d8',
    ctaGradient: 'linear-gradient(135deg, #087f73 0%, #10b981 100%)',
    ctaShadow: '0 4px 12px rgba(8, 127, 115, 0.22)',
    accentPillBg: '#e6f6f2',
    accentPillText: '#065f56',
    accentPillBorder: '#a7dfd0',
    features: ['⚡ Estándar Oficial', '💎 Verde Esmeralda', '🏢 Lectura Clínica'],
  },
};

const NEKO_THEME_COLOR_FIELDS: { key: keyof PosNekoThemeColors; label: string }[] = [
  { key: 'accent', label: 'Acción principal' },
  { key: 'accent2', label: 'Acción secundaria' },
  { key: 'canvas', label: 'Fondo del POS' },
  { key: 'panelBg', label: 'Paneles' },
  { key: 'panelSubBg', label: 'Panel suave' },
  { key: 'cardBg', label: 'Tarjetas' },
  { key: 'inputBg', label: 'Campos' },
  { key: 'toolbarBg', label: 'Barra superior' },
  { key: 'tabbarBg', label: 'Barra inferior' },
  { key: 'ink', label: 'Texto' },
  { key: 'inkStrong', label: 'Texto destacado' },
  { key: 'muted', label: 'Texto secundario' },
  { key: 'line', label: 'Bordes' },
];

const NEKO_CAT_COLOR_FIELDS: { key: keyof PosNekoCatColors; label: string }[] = [
  { key: 'fur', label: 'Pelaje' },
  { key: 'markings', label: 'Manchas y rayas' },
  { key: 'muzzle', label: 'Hocico' },
  { key: 'innerEar', label: 'Interior de orejas' },
  { key: 'eyes', label: 'Ojos' },
  { key: 'nose', label: 'Nariz' },
  { key: 'collar', label: 'Collar' },
];

function ThemeColorField({ label, color, onChange }: { label: string; color: string; onChange: (color: string) => void }) {
  return (
    <label className={styles.colorField}>
      <span className={styles.colorFieldLabel}>{label}</span>
      <span className={styles.colorFieldValue}>
        <input type="color" value={color} onChange={event => onChange(event.currentTarget.value)} aria-label={label} />
        <code>{color.toUpperCase()}</code>
      </span>
    </label>
  );
}

export function ThemeMascotEmblem({
  presetId,
  catDesign,
  customColors,
}: {
  presetId: string;
  catDesign?: PosNekoDesign;
  customColors?: PosThemeCustomColors;
}) {
  if (presetId === 'jasmine-lavender') {
    return (
      <svg viewBox="0 0 64 64" className={styles.mascotSvg} aria-hidden="true">
        <defs>
          <linearGradient id="stuJasGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="50%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
          <linearGradient id="stuJasTeal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#99f6e4" />
            <stop offset="55%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="28" fill="#f0fdfa" stroke="#2dd4bf" strokeWidth="1.6" />
        {/* Back black hair */}
        <circle cx="32" cy="31" r="17" fill="#1e1b4b" />
        {/* Golden hoop earrings */}
        <circle cx="17" cy="36" r="4.5" fill="none" stroke="#facc15" strokeWidth="2.2" />
        <circle cx="47" cy="36" r="4.5" fill="none" stroke="#facc15" strokeWidth="2.2" />
        {/* Shoulders + Gold collar + Turquoise top */}
        <path d="M19 54 C21 45 25 43 32 43 C39 43 43 45 45 54 Z" fill="url(#stuJasTeal)" stroke="#0f766e" strokeWidth="1" />
        <path d="M23 44 C27 48 37 48 41 44 C42 46 37 50 32 50 C27 50 22 46 23 44 Z" fill="url(#stuJasGold)" stroke="#854d0e" strokeWidth="0.9" />
        {/* Jasmine Face */}
        <path d="M20 29 C20 19 44 19 44 29 C44 39 38 45 32 45 C26 45 20 39 20 29 Z" fill="#e3a685" stroke="#9a5b3c" strokeWidth="1.1" />
        {/* Eyes & smile */}
        <ellipse cx="26.5" cy="33" rx="2.1" ry="2.4" fill="#1e1b4b" />
        <ellipse cx="37.5" cy="33" rx="2.1" ry="2.4" fill="#1e1b4b" />
        <circle cx="25.8" cy="32.2" r="0.8" fill="#ffffff" />
        <circle cx="36.8" cy="32.2" r="0.8" fill="#ffffff" />
        <path d="M29 39.5 Q32 42 35 39.5" fill="none" stroke="#9f1239" strokeWidth="1.4" strokeLinecap="round" />
        {/* Center-parted black hair bangs */}
        <path d="M19 29 C19 18 28 15 32 21 C36 15 45 18 45 29 C41 24 36 22 32 25 C28 22 23 24 19 29 Z" fill="#1e1b4b" />
        {/* Iconic Turquoise Headband & Sapphire-Teal Jewel in Gold Setting */}
        <path d="M19.5 23.5 C25 19.5 39 19.5 44.5 23.5 C44 26.5 39 23 32 23 C25 23 20 26.5 19.5 23.5 Z" fill="url(#stuJasTeal)" stroke="#0f766e" strokeWidth="1" />
        <ellipse cx="32" cy="22" rx="4.2" ry="5.2" fill="url(#stuJasGold)" stroke="#854d0e" strokeWidth="0.9" />
        <ellipse cx="32" cy="22" rx="2.8" ry="3.7" fill="#0d9488" stroke="#fef9c3" strokeWidth="0.6" />
        <ellipse cx="31.2" cy="20.6" rx="0.8" ry="1.3" fill="#ffffff" fillOpacity="0.85" />
      </svg>
    );
  }

  if (presetId === 'sakura-coquette') {
    return (
      <svg viewBox="0 0 64 64" className={styles.mascotSvg} aria-hidden="true">
        <defs>
          <radialGradient id="stuSakuraGrad" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#fff5f9" />
            <stop offset="65%" stopColor="#fbcfe8" />
            <stop offset="100%" stopColor="#f472b6" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="28" fill="rgba(255,255,255,0.9)" stroke="#f5a3c4" strokeWidth="1.5" />
        {[0, 72, 144, 216, 288].map(deg => (
          <path
            key={deg}
            d="M32 30 C25 20, 23 11, 29 8 C31 7, 32 9, 32 10.5 C32 9, 33 7, 35 8 C41 11, 39 20, 32 30 Z"
            fill="url(#stuSakuraGrad)"
            stroke="#e879a8"
            strokeWidth="0.9"
            transform={`rotate(${deg} 32 30)`}
          />
        ))}
        <circle cx="32" cy="30" r="4.5" fill="#fbbf24" />
        {/* Coquette ribbon bow at bottom */}
        <path d="M32 46 C23 39, 18 48, 29 49 Z" fill="#ec4899" />
        <path d="M32 46 C41 39, 46 48, 35 49 Z" fill="#ec4899" />
        <circle cx="32" cy="46.5" r="2.6" fill="#be185d" />
      </svg>
    );
  }

  if (isPosNekoTheme(presetId)) {
    const design = catDesign || (presetId === 'neko-nocturno' ? 'white-tabby' : 'orange-tabby');
    const cat = getPosNekoCatColors(design, customColors);
    return (
      <svg viewBox="0 0 64 64" className={styles.mascotSvg} aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#ffffff" stroke={cat.markings} strokeOpacity="0.3" strokeWidth="1.5" />
        <path
          d="M15 27 L12 11 L27 20 Z"
          fill={design === 'white-tabby' ? cat.markings : cat.fur}
          stroke={cat.markings}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M17 23 L14.5 14.5 L23.5 20.5 Z" fill={cat.innerEar} />
        <path
          d="M49 27 L52 11 L37 20 Z"
          fill={design === 'white-tabby' ? cat.markings : cat.fur}
          stroke={cat.markings}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M47 23 L49.5 14.5 L40.5 20.5 Z" fill={cat.innerEar} />
        <ellipse cx="32" cy="33" rx="18" ry="15" fill={cat.fur} stroke={cat.markings} strokeWidth="1.3" />
        {design === 'white-tabby' && (
          <>
            <path d="M15 31 C16 20 23 18 30 20 L30 28 C25 31 20 32 15 31 Z" fill={cat.markings} />
            <path d="M49 31 C48 20 41 18 34 20 L34 28 C39 31 44 32 49 31 Z" fill={cat.markings} />
            <path d="M21 21 L24 25 M18 25 L22 28 M43 21 L40 25 M46 25 L42 28" stroke="#1f1610" strokeWidth="1.4" strokeLinecap="round" />
          </>
        )}
        {design === 'orange-tabby' && <path d="M28 21 L29 26 M32 20 L32 27 M36 21 L35 26" stroke={cat.markings} strokeWidth="1.7" strokeLinecap="round" />}
        {design === 'tuxedo' && <path d="M18 30 C21 22 26 23 30 28 L30 35 C25 37 21 35 18 30 M46 30 C43 22 38 23 34 28 L34 35 C39 37 43 35 46 30" fill={cat.markings} />}
        <ellipse cx="32" cy="37" rx="9" ry="7" fill={cat.muzzle} />
        {design === 'white-tabby' && (
          <>
            {/* Fernanda's Cat Nose Smudge */}
            <ellipse cx="31.2" cy="34.2" rx="2.8" ry="3.2" fill={cat.markings} opacity="0.9" />
            <circle cx="28.8" cy="36.8" r="1.3" fill={cat.markings} opacity="0.85" />
          </>
        )}
        <circle cx="24" cy="32" r="2.6" fill={cat.eyes} stroke="#1f1610" strokeWidth="0.6" />
        <circle cx="40" cy="32" r="2.6" fill={cat.eyes} stroke="#1f1610" strokeWidth="0.6" />
        <circle cx="24.7" cy="31.2" r="0.85" fill="#ffffff" />
        <circle cx="40.7" cy="31.2" r="0.85" fill="#ffffff" />
        <path d="M29 37.5 Q32 40.5 35 37.5" fill="none" stroke={cat.markings} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M19 45 Q32 50 45 45" fill="none" stroke={cat.collar} strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="32" cy="48.5" r="3.2" fill="#facc15" stroke="#a16207" strokeWidth="0.8" />
        <path d="M29 36 L32 34.5 L35 36 L32 38 Z" fill={cat.nose} />
      </svg>
    );
  }

  if (presetId === 'capy-matcha') {
    return (
      <svg viewBox="0 0 64 64" className={styles.mascotSvg} aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="rgba(248,254,249,0.92)" stroke="#86cf9e" strokeWidth="1.5" />
        {/* Yuzu on head */}
        <circle cx="32" cy="14.5" r="5.5" fill="#fb923c" stroke="#9a3412" strokeWidth="1.1" />
        <path d="M32 9 C34.5 6.8, 38 7.5, 37.2 10 C35.2 10.6, 33.4 10, 32 9 Z" fill="#4ade80" stroke="#14532d" strokeWidth="0.8" />
        {/* Capybara ears */}
        <ellipse cx="19" cy="23" rx="4.2" ry="3" transform="rotate(-25 19 23)" fill="#854d27" stroke="#5c3418" strokeWidth="1.1" />
        <ellipse cx="45" cy="23" rx="4.2" ry="3" transform="rotate(25 45 23)" fill="#854d27" stroke="#5c3418" strokeWidth="1.1" />
        {/* Capybara head */}
        <rect x="14" y="20" width="36" height="28" rx="13" fill="#c98e58" stroke="#5c3418" strokeWidth="1.4" />
        <rect x="24" y="28" width="16" height="15" rx="7" fill="#965d30" />
        {/* Serene eyes */}
        <path d="M19 30 Q21.5 28.2 24 30" fill="none" stroke="#3b1f0b" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M40 30 Q42.5 28.2 45 30" fill="none" stroke="#3b1f0b" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="19" cy="34" rx="2.8" ry="1.5" fill="#fb7185" opacity="0.6" />
        <ellipse cx="45" cy="34" rx="2.8" ry="1.5" fill="#fb7185" opacity="0.6" />
        <circle cx="29.5" cy="32.5" r="1.2" fill="#3b1f0b" />
        <circle cx="34.5" cy="32.5" r="1.2" fill="#3b1f0b" />
        <path d="M32 34 L32 38 M29.5 38.5 Q32 40.5 34.5 38.5" fill="none" stroke="#3b1f0b" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={styles.mascotSvg} aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="#ffffff" stroke="#a7dfd0" strokeWidth="1.5" />
      <rect x="18" y="18" width="28" height="28" rx="9" fill="url(#stuEmeraldGrad)" />
      <defs>
        <linearGradient id="stuEmeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#087f73" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <path
        d="M25 32.5 L30 37.5 L39.5 26.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeShowcaseBanner({ preset }: { preset: PosThemePreset }) {
  const meta = THEME_VISUAL_META[preset.id] || THEME_VISUAL_META['asistora-original'];

  return (
    <div
      className={styles.showcaseStage}
      style={{
        backgroundColor: meta.canvasBg,
        backgroundImage: meta.wallpaperUrl ? `url("${meta.wallpaperUrl}")` : meta.stageBackgroundImage,
        backgroundSize: meta.stageBackgroundSize || (meta.wallpaperUrl ? 'cover' : undefined),
        backgroundPosition: meta.wallpaperPosition || 'center',
      }}
      aria-hidden="true"
    >
      {/* Top Frosted Mini Toolbar */}
      <div
        className={styles.showcaseTopbar}
        style={{
          background: meta.glassPanelBg,
          borderBottom: meta.glassBorder,
        }}
      >
        <div className={styles.showcaseTopbarDots}>
          <span className={styles.showcaseDot} style={{ background: meta.ctaGradient }} />
          <span className={styles.showcaseBar} />
        </div>
        <span
          className={styles.showcaseTag}
          style={{
            background: meta.accentPillBg,
            color: meta.accentPillText,
            border: `1px solid ${meta.accentPillBorder}`,
          }}
        >
          {preset.badge}
        </span>
      </div>

      {/* Center Stage: Mascot Emblem + Mini Glass POS Card + Cobrar Pill */}
      <div className={styles.showcaseBody}>
        <div className={styles.mascotBadgeWrap}>
          <ThemeMascotEmblem
            presetId={preset.id}
            catDesign={preset.config.catDesign}
            customColors={preset.config.customColors}
          />
        </div>

        <div
          className={styles.showcaseMiniPanel}
          style={{
            background: meta.glassPanelBg,
            border: meta.glassBorder,
          }}
        >
          <div className={styles.showcaseMiniRows}>
            <div className={styles.showcaseMiniRow} />
            <div className={styles.showcaseMiniRowShort} />
          </div>
          <div
            className={styles.showcaseMiniCta}
            style={{
              background: meta.ctaGradient,
              boxShadow: meta.ctaShadow,
            }}
          >
            COBRAR $12.990
          </div>
        </div>
      </div>
    </div>
  );
}

export interface PosThemeStudioProps {
  open: boolean;
  operatorName?: string;
  value: PosPersonalTheme;
  saving?: boolean;
  onChange: (next: PosPersonalTheme) => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function PosThemeStudio({
  open,
  operatorName,
  value,
  saving = false,
  onChange,
  onCancel,
  onSave,
}: PosThemeStudioProps) {
  const [floatingMode, setFloatingMode] = useState(false);

  useEffect(() => {
    if (open) {
      setFloatingMode(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  const activePreset = useMemo(
    () => POS_THEME_PRESETS.find(item => item.id === value.presetId) || POS_THEME_PRESETS[0],
    [value.presetId]
  );
  const isNekoPreset = isPosNekoTheme(value.presetId);
  const nekoThemeDefaults = value.presetId === 'neko-nocturno'
    ? POS_NEKO_THEME_COLOR_DEFAULTS['neko-nocturno']
    : POS_NEKO_THEME_COLOR_DEFAULTS['neko-mikan'];
  const catDesign = value.catDesign || activePreset.config.catDesign || (value.presetId === 'neko-nocturno' ? 'white-tabby' : 'orange-tabby');
  const nekoCatColors = getPosNekoCatColors(catDesign, value.customColors);

  const updateNekoColor = (key: PosNekoColorKey, color: string) => {
    onChange({
      ...value,
      pattern: !value.customColors && value.pattern === 'none' ? 'neko' : value.pattern,
      customColors: { ...value.customColors, [key]: color },
    });
  };

  const selectCatDesign = (design: PosNekoDesign) => {
    onChange({
      ...value,
      catDesign: design,
      pattern: !value.customColors && value.pattern === 'none' ? 'neko' : value.pattern,
      customColors: { ...value.customColors, ...POS_NEKO_CAT_DESIGNS[design] },
    });
  };

  const selectPreset = (preset: PosThemePreset) => {
    if (preset.id === 'sakura-coquette') {
      void cacheSakuraWallpaper();
    } else if (preset.id === 'neko-mikan') {
      void cacheNekoWallpaper();
    } else if (preset.id === 'capy-matcha') {
      void cacheCapyWallpaper();
    } else if (preset.id === 'jasmine-lavender') {
      void cacheJasmineWallpaper();
    }
    onChange(presetToPersonalTheme(preset));
  };

  const stepPreset = (delta: -1 | 1) => {
    const list = POS_THEME_PRESETS;
    const currentIdx = list.findIndex(p => p.id === value.presetId);
    const nextIdx =
      currentIdx === -1 ? 0 : (currentIdx + delta + list.length) % list.length;
    selectPreset(list[nextIdx]);
  };

  if (!open) return null;

  if (floatingMode) {
    return (
      <div className={styles.floatingDockWrap} role="dialog" aria-label="Vista en vivo de estilos POS">
        <div className={styles.floatingDock}>
          <div className={styles.dockTopRow}>
            <div className={styles.dockStepper}>
              <button
                type="button"
                className={styles.dockStepBtn}
                onClick={() => stepPreset(-1)}
                title="Plantilla anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className={styles.dockStepBtn}
                onClick={() => stepPreset(1)}
                title="Siguiente plantilla"
              >
                <ChevronRight size={16} />
              </button>
              <div className={styles.dockActiveInfo}>
                <div className={styles.dockActiveLabel}>Vista en vivo sobre el POS</div>
                <div className={styles.dockActiveName}>{activePreset.name}</div>
              </div>
            </div>

            <div className={styles.dockActions}>
              <button
                type="button"
                className={styles.dockExpandBtn}
                onClick={() => setFloatingMode(false)}
              >
                <Maximize2 size={14} />
                Volver a la Galería
              </button>
              <button type="button" className={styles.cancelBtn} onClick={onCancel}>
                Cancelar
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                disabled={saving}
                onClick={onSave}
              >
                <Check size={15} />
                {saving ? 'Guardando...' : 'Guardar tema'}
              </button>
            </div>
          </div>

          <div className={styles.dockPresetsRail}>
            {POS_THEME_PRESETS.map(preset => {
              const palette = POS_ACCENT_PALETTES[preset.config.accent];
              const isSelected = value.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={`${styles.dockPresetPill} ${
                    isSelected ? styles.dockPresetPillActive : ''
                  }`}
                >
                  <span
                    className={styles.dockPresetDot}
                    style={{
                      background: `linear-gradient(135deg, ${palette.color}, ${palette.color2})`,
                    }}
                  />
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.backdrop}
      onClick={e => {
        if (e.target === e.currentTarget) {
          setFloatingMode(true);
        }
      }}
    >
      <div
        className={styles.studioModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-theme-studio-title"
      >
        {/* Clean Single-Row Boutique Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerGem}>
              <Sparkles size={19} />
            </div>
            <div className={styles.headerTitleBlock}>
              <div className={styles.headerTitleRow}>
                <h2 id="pos-theme-studio-title" className={styles.title}>
                  Galer&iacute;a de Temas POS
                </h2>
                {operatorName && (
                  <span className={styles.operatorPill}>{operatorName}</span>
                )}
                <span className={styles.livePill}>
                  <span className={styles.liveDot} />
                  Vista previa en vivo
                </span>
              </div>
              <p className={styles.subtitle}>
                Elige un mundo visual ilustrado con animaciones, part&iacute;culas y fondo HD exclusivo para tu turno.
              </p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.floatModeBtn}
              onClick={() => setFloatingMode(true)}
              title="Oculta esta ventana para ver el POS completo mientras cambias de tema"
            >
              <Eye size={15} />
              Ver POS completo
            </button>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onCancel}
              aria-label="Cerrar galería de temas"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Collector's Showcase Grid */}
        <div className={styles.body}>
          <div className={styles.presetGrid}>
            {POS_THEME_PRESETS.map(preset => {
              const isSelected = value.presetId === preset.id;
              const meta =
                THEME_VISUAL_META[preset.id] || THEME_VISUAL_META['asistora-original'];

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={`${styles.presetCard} ${
                    isSelected ? styles.presetCardActive : ''
                  }`}
                >
                  <ThemeShowcaseBanner preset={preset} />

                  <div className={styles.presetContent}>
                    <div className={styles.presetTitleRow}>
                      <span className={styles.presetName}>{preset.name}</span>
                      {isSelected ? (
                        <span
                          className={styles.selectedPill}
                          style={{ background: meta.ctaGradient }}
                        >
                          <Check size={12} strokeWidth={3} />
                          Activo
                        </span>
                      ) : (
                        <span className={styles.tryPill}>Elegir</span>
                      )}
                    </div>

                    <p className={styles.presetDesc}>{preset.description}</p>

                    <div className={styles.featurePillsRow}>
                      {meta.features.map(feat => (
                        <span
                          key={feat}
                          className={styles.featurePill}
                          style={
                            isSelected
                              ? {
                                  background: meta.accentPillBg,
                                  color: meta.accentPillText,
                                  borderColor: meta.accentPillBorder,
                                }
                              : undefined
                          }
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {isNekoPreset && (
            <section className={styles.nekoCustomizer} aria-label="Personalizar el diseño del gato y los colores del POS">
              <div className={styles.nekoCustomizerHeader}>
                <div className={styles.nekoCustomizerIntro}>
                  <div className={styles.nekoReferencePhotoWrap}>
                    <img src="/pos/wallpapers/neko-fernanda.jpg" alt="Gato blanco y atigrado de Fernanda" className={styles.nekoReferencePhoto} />
                  </div>
                  <div>
                    <span className={styles.nekoEyebrow}>TALLER NEKO · EDICIÓN EN VIVO</span>
                    <h3 className={styles.nekoCustomizerTitle}>Diseña el michi y pinta el POS</h3>
                    <p className={styles.nekoCustomizerSubtitle}>Prueba los colores al instante; al guardar, quedan en este perfil de caja.</p>
                  </div>
                </div>
                <button type="button" className={styles.nekoResetBtn} onClick={() => selectPreset(activePreset)}>
                  <RotateCcw size={13} />
                  Restaurar diseño
                </button>
              </div>

              <div className={styles.nekoCustomizerGrid}>
                <section className={styles.nekoEditorGroup}>
                  <div className={styles.nekoGroupHeading}>
                    <span className={styles.nekoGroupNumber}>01</span>
                    <div>
                      <h4>Diseño del gato</h4>
                      <p>Elige el pelaje y después edita cada color.</p>
                    </div>
                  </div>
                  <div className={styles.catDesignGrid}>
                    {([
                      { id: 'white-tabby', label: 'Atigrado blanco' },
                      { id: 'orange-tabby', label: 'Naranjita' },
                      { id: 'tuxedo', label: 'Tuxedo' },
                    ] as { id: PosNekoDesign; label: string }[]).map(option => (
                      <button
                        key={option.id}
                        type="button"
                        className={`${styles.catDesignOption} ${catDesign === option.id ? styles.catDesignOptionActive : ''}`}
                        aria-pressed={catDesign === option.id}
                        onClick={() => selectCatDesign(option.id)}
                      >
                        <span className={styles.catDesignEmblem}>
                          <ThemeMascotEmblem
                            presetId={value.presetId}
                            catDesign={option.id}
                            customColors={catDesign === option.id ? value.customColors : POS_NEKO_CAT_DESIGNS[option.id]}
                          />
                        </span>
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.nekoColorGrid}>
                    {NEKO_CAT_COLOR_FIELDS.map(field => (
                      <ThemeColorField
                        key={field.key}
                        label={field.label}
                        color={nekoCatColors[field.key]}
                        onChange={color => updateNekoColor(field.key, color)}
                      />
                    ))}
                  </div>
                </section>

                <section className={styles.nekoEditorGroup}>
                  <div className={styles.nekoGroupHeading}>
                    <span className={styles.nekoGroupNumber}>02</span>
                    <div>
                      <h4>Colores del POS</h4>
                      <p>Acciones, fondos, paneles, textos y bordes.</p>
                    </div>
                  </div>
                  <div className={styles.nekoColorGrid}>
                    {NEKO_THEME_COLOR_FIELDS.map(field => (
                      <ThemeColorField
                        key={field.key}
                        label={field.label}
                        color={value.customColors?.[field.key] || nekoThemeDefaults[field.key]}
                        onChange={color => updateNekoColor(field.key, color)}
                      />
                    ))}
                  </div>
                  <details className={styles.nekoAdvancedDisclosure}>
                    <summary className={styles.nekoAdvancedSummary}>Forma, tarjetas, tipografía y patrón</summary>
                    <div className={styles.nekoAdvancedGrid}>
                      <label className={styles.nekoSelectField}>
                        <span>Superficie</span>
                        <select value={value.mode} onChange={event => onChange({ ...value, mode: event.currentTarget.value as PosSurfaceMode })}>
                          <option value="glass">Cristal</option><option value="light">Clara</option><option value="tinted">Tintada</option><option value="contrast-header">Cabecera destacada</option><option value="dark">Oscura</option>
                        </select>
                      </label>
                      <label className={styles.nekoSelectField}>
                        <span>Forma de paneles</span>
                        <select value={value.shape} onChange={event => onChange({ ...value, shape: event.currentTarget.value as PosShapeStyle })}>
                          <option value="soft">Redondeada</option><option value="modern">Moderna</option><option value="sharp">Recta</option>
                        </select>
                      </label>
                      <label className={styles.nekoSelectField}>
                        <span>Acabado de tarjetas</span>
                        <select value={value.cardFinish} onChange={event => onChange({ ...value, cardFinish: event.currentTarget.value as PosCardFinish })}>
                          <option value="neo">Relieve</option><option value="clean">Limpio</option><option value="glass">Cristal</option><option value="accent-stripe">Franja de color</option>
                        </select>
                      </label>
                      <label className={styles.nekoSelectField}>
                        <span>Tipografía</span>
                        <select value={value.fontStyle} onChange={event => onChange({ ...value, fontStyle: event.currentTarget.value as PosFontStyle })}>
                          <option value="rounded">Redondeada</option><option value="modern">Moderna</option><option value="editorial">Editorial</option><option value="tech">Técnica</option>
                        </select>
                      </label>
                      <label className={styles.nekoSelectField}>
                        <span>Patrón de fondo</span>
                        <select value={value.pattern} onChange={event => onChange({ ...value, pattern: event.currentTarget.value as PosPatternId })}>
                          <option value="neko">Huellitas</option><option value="none">Sin patrón</option><option value="aurora">Aurora</option><option value="constellation">Estrellas</option><option value="luxe-geo">Geometría</option>
                        </select>
                      </label>
                    </div>
                  </details>
                </section>
              </div>
            </section>
          )}
        </div>

        {/* Clean Footer */}
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={() => selectPreset(POS_THEME_PRESETS.find(p => p.id === 'asistora-original')!)}
          >
            <RotateCcw size={14} />
            Restaurar Cl&aacute;sico Oficial
          </button>

          <div className={styles.footerRight}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className={styles.saveBtn}
              disabled={saving}
              onClick={onSave}
            >
              <Check size={16} strokeWidth={2.6} />
              {saving ? 'Guardando...' : 'Guardar este tema'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
