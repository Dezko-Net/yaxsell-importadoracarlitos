import type { CSSProperties } from 'react';
import {
  getCachedCapyWallpaper,
  getCachedJasmineWallpaper,
  getCachedNekoFernandaWallpaper,
  getCachedNekoWallpaper,
  getCachedSakuraWallpaper,
  CAPY_LOCAL_WALLPAPER,
  JASMINE_LOCAL_WALLPAPER,
  NEKO_FERNANDA_LOCAL_WALLPAPER,
  NEKO_LOCAL_WALLPAPER,
  SAKURA_REMOTE_WALLPAPER,
  SAKURA_LOCAL_WALLPAPER,
} from './posWallpaperCache';

export type PosThemeAudience = 'all' | 'ellas' | 'ellos' | 'unisex';
export type PosSurfaceMode = 'light' | 'tinted' | 'glass' | 'contrast-header' | 'dark';
export type PosShapeStyle = 'sharp' | 'modern' | 'soft';
export type PosCardFinish = 'clean' | 'glass' | 'accent-stripe' | 'neo';
export type PosFontStyle = 'modern' | 'rounded' | 'editorial' | 'tech';
export type PosPatternId =
  | 'none'
  | 'sakura'
  | 'neko'
  | 'coquette'
  | 'botanical'
  | 'aurora'
  | 'carbon'
  | 'hud-grid'
  | 'constellation'
  | 'luxe-geo'
  | 'jasmine';

export type PosAccentId =
  | 'emerald'
  | 'sakura'
  | 'mikan'
  | 'rosegold'
  | 'amethyst'
  | 'cobalt'
  | 'crimson'
  | 'amber'
  | 'copper'
  | 'navy'
  | 'matcha'
  | 'jasmine'
  | 'gold'
  | 'cyber';

export type PosNekoDesign = 'white-tabby' | 'orange-tabby' | 'tuxedo';

export interface PosNekoCatColors {
  fur: string;
  markings: string;
  muzzle: string;
  innerEar: string;
  eyes: string;
  nose: string;
  collar: string;
}

export interface PosNekoThemeColors {
  accent: string;
  accent2: string;
  canvas: string;
  panelBg: string;
  panelSubBg: string;
  cardBg: string;
  inputBg: string;
  toolbarBg: string;
  tabbarBg: string;
  ink: string;
  inkStrong: string;
  muted: string;
  line: string;
}

export type PosNekoColorKey = keyof PosNekoCatColors | keyof PosNekoThemeColors;
export type PosThemeCustomColors = Partial<PosNekoCatColors & PosNekoThemeColors>;

export interface PosPersonalTheme {
  version: 2;
  presetId: string;
  mode: PosSurfaceMode;
  accent: PosAccentId;
  shape: PosShapeStyle;
  cardFinish: PosCardFinish;
  fontStyle: PosFontStyle;
  pattern: PosPatternId;
  catDesign?: PosNekoDesign;
  customColors?: PosThemeCustomColors;
}

export interface PosAccentPalette {
  id: PosAccentId;
  label: string;
  color: string;
  color2: string;
  contrastText: string;
  lightSoft: string;
  lightBorder: string;
  lightText: string;
  darkSoft: string;
  darkBorder: string;
  darkText: string;
  glow: string;
}

export interface PosThemePreset {
  id: string;
  name: string;
  badge: string;
  signature: string;
  description: string;
  audience: Exclude<PosThemeAudience, 'all'>;
  config: Omit<PosPersonalTheme, 'version' | 'presetId'>;
  paletteOverrides?: {
    canvas?: string;
    canvasGlow?: string;
    canvasImage?: string;
    panelBg?: string;
    panelSubBg?: string;
    cardBg?: string;
    inputBg?: string;
    toolbarBg?: string;
    toolbarTone?: 'light' | 'dark';
    tabbarBg?: string;
    ink?: string;
    inkStrong?: string;
    muted?: string;
    line?: string;
  };
}

export const POS_ACCENT_PALETTES: Record<PosAccentId, PosAccentPalette> = {
  emerald: {
    id: 'emerald',
    label: 'Esmeralda Asistora',
    color: '#087f73',
    color2: '#10b981',
    contrastText: '#ffffff',
    lightSoft: '#e4f5ef',
    lightBorder: '#a7dfd0',
    lightText: '#065f56',
    darkSoft: 'rgba(16, 185, 129, 0.18)',
    darkBorder: 'rgba(52, 211, 153, 0.42)',
    darkText: '#6ee7b7',
    glow: 'rgba(8, 127, 115, 0.32)',
  },
  sakura: {
    id: 'sakura',
    label: 'Fresa & Sakura',
    color: '#e11d74',
    color2: '#fb7185',
    contrastText: '#ffffff',
    lightSoft: '#ffe4ef',
    lightBorder: '#f9a8d4',
    lightText: '#be185d',
    darkSoft: 'rgba(244, 63, 140, 0.2)',
    darkBorder: 'rgba(251, 113, 133, 0.46)',
    darkText: '#fda4af',
    glow: 'rgba(225, 29, 116, 0.34)',
  },
  mikan: {
    id: 'mikan',
    label: 'Mandarina & Gato Naranja',
    color: '#e07228',
    color2: '#f29345',
    contrastText: '#ffffff',
    lightSoft: '#ffedd5',
    lightBorder: '#f6b37f',
    lightText: '#a84810',
    darkSoft: 'rgba(242, 147, 69, 0.2)',
    darkBorder: 'rgba(246, 179, 127, 0.48)',
    darkText: '#fdba74',
    glow: 'rgba(224, 114, 40, 0.28)',
  },
  rosegold: {
    id: 'rosegold',
    label: 'Oro Rosa Couture',
    color: '#be3b6f',
    color2: '#df8a57',
    contrastText: '#ffffff',
    lightSoft: '#fce8ef',
    lightBorder: '#efb8cb',
    lightText: '#962753',
    darkSoft: 'rgba(232, 121, 169, 0.18)',
    darkBorder: 'rgba(240, 171, 142, 0.46)',
    darkText: '#fbd0df',
    glow: 'rgba(209, 77, 129, 0.36)',
  },
  amethyst: {
    id: 'amethyst',
    label: 'Iris & Amatista',
    color: '#7c3aed',
    color2: '#ec4899',
    contrastText: '#ffffff',
    lightSoft: '#ede5ff',
    lightBorder: '#c4b5fd',
    lightText: '#5b21b6',
    darkSoft: 'rgba(139, 92, 246, 0.22)',
    darkBorder: 'rgba(196, 181, 253, 0.46)',
    darkText: '#ddd6fe',
    glow: 'rgba(124, 58, 237, 0.34)',
  },
  cobalt: {
    id: 'cobalt',
    label: 'Cobalto Ingeniería',
    color: '#1d4ed8',
    color2: '#0284c7',
    contrastText: '#ffffff',
    lightSoft: '#e0ecff',
    lightBorder: '#93c5fd',
    lightText: '#1e40af',
    darkSoft: 'rgba(59, 130, 246, 0.2)',
    darkBorder: 'rgba(96, 165, 250, 0.45)',
    darkText: '#93c5fd',
    glow: 'rgba(29, 78, 216, 0.34)',
  },
  crimson: {
    id: 'crimson',
    label: 'Rojo Telemetría GT',
    color: '#dc2626',
    color2: '#f97316',
    contrastText: '#ffffff',
    lightSoft: '#fee2e2',
    lightBorder: '#fca5a5',
    lightText: '#b91c1c',
    darkSoft: 'rgba(239, 68, 68, 0.22)',
    darkBorder: 'rgba(248, 113, 113, 0.5)',
    darkText: '#fca5a5',
    glow: 'rgba(220, 38, 38, 0.42)',
  },
  amber: {
    id: 'amber',
    label: 'Fósforo Ámbar HUD',
    color: '#d97706',
    color2: '#f59e0b',
    contrastText: '#111311',
    lightSoft: '#fef3c7',
    lightBorder: '#fcd34d',
    lightText: '#92400e',
    darkSoft: 'rgba(245, 158, 11, 0.2)',
    darkBorder: 'rgba(251, 191, 36, 0.52)',
    darkText: '#fde047',
    glow: 'rgba(245, 158, 11, 0.38)',
  },
  copper: {
    id: 'copper',
    label: 'Cobre Tostaduría',
    color: '#9a3412',
    color2: '#d97706',
    contrastText: '#ffffff',
    lightSoft: '#faebd7',
    lightBorder: '#e6be94',
    lightText: '#7c2d12',
    darkSoft: 'rgba(234, 88, 12, 0.2)',
    darkBorder: 'rgba(251, 146, 60, 0.42)',
    darkText: '#fdba74',
    glow: 'rgba(154, 52, 18, 0.32)',
  },
  navy: {
    id: 'navy',
    label: 'Acero Atlántico',
    color: '#0f3460',
    color2: '#0284c7',
    contrastText: '#ffffff',
    lightSoft: '#dce9f9',
    lightBorder: '#9ec0e6',
    lightText: '#0c2d57',
    darkSoft: 'rgba(56, 189, 248, 0.18)',
    darkBorder: 'rgba(125, 211, 252, 0.42)',
    darkText: '#7dd3fc',
    glow: 'rgba(15, 52, 96, 0.34)',
  },
  matcha: {
    id: 'matcha',
    label: 'Matcha Ceremonial',
    color: '#2d6a4f',
    color2: '#52b788',
    contrastText: '#ffffff',
    lightSoft: '#e2f0e4',
    lightBorder: '#a8d1b2',
    lightText: '#1b4332',
    darkSoft: 'rgba(82, 183, 136, 0.2)',
    darkBorder: 'rgba(116, 198, 157, 0.42)',
    darkText: '#95d5b2',
    glow: 'rgba(45, 106, 79, 0.32)',
  },
  jasmine: {
    id: 'jasmine',
    label: 'Turquesa Oasis & Oro Real',
    color: '#0f9690',
    color2: '#2dd4bf',
    contrastText: '#ffffff',
    lightSoft: '#dffaf6',
    lightBorder: '#5eead4',
    lightText: '#0d6b66',
    darkSoft: 'rgba(20, 184, 166, 0.2)',
    darkBorder: 'rgba(94, 234, 212, 0.46)',
    darkText: '#99f6e4',
    glow: 'rgba(15, 150, 144, 0.28)',
  },
  gold: {
    id: 'gold',
    label: 'Lingote Oro 24K',
    color: '#b78618',
    color2: '#eab308',
    contrastText: '#141109',
    lightSoft: '#fcf3cf',
    lightBorder: '#e8c967',
    lightText: '#785408',
    darkSoft: 'rgba(234, 179, 8, 0.18)',
    darkBorder: 'rgba(234, 179, 8, 0.48)',
    darkText: '#fde047',
    glow: 'rgba(218, 165, 32, 0.36)',
  },
  cyber: {
    id: 'cyber',
    label: 'Láser Cian & Magenta',
    color: '#06b6d4',
    color2: '#ec4899',
    contrastText: '#ffffff',
    lightSoft: '#cffafe',
    lightBorder: '#67e8f9',
    lightText: '#0e7490',
    darkSoft: 'rgba(6, 182, 212, 0.2)',
    darkBorder: 'rgba(34, 211, 238, 0.56)',
    darkText: '#67e8f9',
    glow: 'rgba(6, 182, 212, 0.46)',
  },
};

export const POS_NEKO_CAT_DESIGNS: Record<PosNekoDesign, PosNekoCatColors> = {
  'white-tabby': {
    fur: '#f8fafc',
    markings: '#4b3b30',
    muzzle: '#ffffff',
    innerEar: '#e8a0a8',
    eyes: '#7d9c3a',
    nose: '#c46358',
    collar: '#c92343',
  },
  'orange-tabby': {
    fur: '#f59e0b',
    markings: '#9a3412',
    muzzle: '#fff7ed',
    innerEar: '#fda4af',
    eyes: '#5b2b0e',
    nose: '#f43f5e',
    collar: '#ef4444',
  },
  tuxedo: {
    fur: '#1e293b',
    markings: '#f8fafc',
    muzzle: '#ffffff',
    innerEar: '#e9a3ad',
    eyes: '#c9a349',
    nose: '#e9a3ad',
    collar: '#c92343',
  },
};

export const POS_NEKO_THEME_COLOR_DEFAULTS: Record<'neko-mikan' | 'neko-nocturno', PosNekoThemeColors> = {
  'neko-mikan': {
    accent: '#e07228',
    accent2: '#f29345',
    canvas: '#fad5ad',
    panelBg: '#fffaf4',
    panelSubBg: '#fff3e8',
    cardBg: '#ffffff',
    inputBg: '#ffffff',
    toolbarBg: '#fff1e2',
    tabbarBg: '#fff4e9',
    ink: '#522810',
    inkStrong: '#361605',
    muted: '#945630',
    line: '#f5b886',
  },
  'neko-nocturno': {
    accent: '#c92343',
    accent2: '#ef4962',
    canvas: '#1e2f4d',
    panelBg: '#f8fbff',
    panelSubBg: '#eef4fc',
    cardBg: '#ffffff',
    inputBg: '#ffffff',
    toolbarBg: '#f4f8ff',
    tabbarBg: '#f5f9ff',
    ink: '#1e293b',
    inkStrong: '#0f172a',
    muted: '#475569',
    line: '#f4a3b4',
  },
};

export function isPosNekoTheme(presetId: string): boolean {
  return presetId.startsWith('neko-');
}

export function isPosNekoAnimatedTheme(presetId: string): boolean {
  return presetId === 'neko-mikan' || presetId === 'neko-nocturno';
}

export function getPosNekoCatColors(
  design: PosNekoDesign = 'orange-tabby',
  customColors?: PosThemeCustomColors,
): PosNekoCatColors {
  const defaults = POS_NEKO_CAT_DESIGNS[design] || POS_NEKO_CAT_DESIGNS['orange-tabby'];
  return {
    fur: customColors?.fur || defaults.fur,
    markings: customColors?.markings || defaults.markings,
    muzzle: customColors?.muzzle || defaults.muzzle,
    innerEar: customColors?.innerEar || defaults.innerEar,
    eyes: customColors?.eyes || defaults.eyes,
    nose: customColors?.nose || defaults.nose,
    collar: customColors?.collar || defaults.collar,
  };
}

export const POS_THEME_PRESETS: PosThemePreset[] = [
  {
    id: 'sakura-coquette',
    name: 'Sakura Milk & Coquette',
    badge: 'Patisserie & Lazos',
    signature: 'Costura punteada · Wallpaper Sakura HD · Lluvia de pétalos',
    description:
      'Inspirado en pastelería japonesa strawberry-milk con fondo ilustrado Sakura en alta definición, paneles crema rosada con blur suave y lluvia de pétalos al cobrar.',
    audience: 'ellas',
    config: {
      mode: 'glass',
      accent: 'sakura',
      shape: 'soft',
      cardFinish: 'neo',
      fontStyle: 'rounded',
      pattern: 'none',
    },
    paletteOverrides: {
      canvas: '#e89dae',
      canvasGlow: 'none',
      canvasImage: 'url("/pos/wallpapers/sakura-bloom-bokeh.jpg")',
      panelBg: 'rgba(255, 248, 251, 0.80)',
      panelSubBg: 'rgba(255, 242, 247, 0.58)',
      cardBg: 'rgba(255, 255, 255, 0.94)',
      inputBg: '#ffffff',
      toolbarBg:
        'linear-gradient(90deg, rgba(255, 238, 245, 0.86) 0%, rgba(255, 228, 239, 0.86) 50%, rgba(255, 240, 246, 0.86) 100%)',
      toolbarTone: 'light',
      tabbarBg: 'rgba(255, 242, 248, 0.84)',
      ink: '#54213b',
      inkStrong: '#380f24',
      muted: '#965274',
      line: '#f5aacb',
    },
  },
  {
    id: 'neko-mikan',
    name: 'Mikan Neko & Gato Naranja',
    badge: 'Cat Café & Michis',
    signature: 'Gatos naranjas HD · Huellitas & Cascabeles · Crema mandarina',
    description:
      'Inspirado en un Cat Café japonés de michis naranjas atigrados: fondo ilustrado con gatitos y flores de mandarina, paneles crema durazno con blur sedoso, huellitas y lluvia gatuna al cobrar.',
    audience: 'ellas',
    config: {
      mode: 'glass',
      accent: 'mikan',
      shape: 'soft',
      cardFinish: 'neo',
      fontStyle: 'rounded',
      pattern: 'none',
      catDesign: 'orange-tabby',
    },
    paletteOverrides: {
      canvas: '#fad5ad',
      canvasGlow: 'none',
      canvasImage: 'url("/pos/wallpapers/neko-mikan-hd.jpg")',
      panelBg: 'rgba(255, 250, 244, 0.80)',
      panelSubBg: 'rgba(255, 243, 232, 0.58)',
      cardBg: 'rgba(255, 255, 255, 0.94)',
      inputBg: '#ffffff',
      toolbarBg:
        'linear-gradient(90deg, rgba(255, 241, 226, 0.88) 0%, rgba(255, 231, 207, 0.88) 50%, rgba(255, 242, 228, 0.88) 100%)',
      toolbarTone: 'light',
      tabbarBg: 'rgba(255, 244, 233, 0.84)',
      ink: '#522810',
      inkStrong: '#361605',
      muted: '#945630',
      line: '#f5b886',
    },
  },
  {
    id: 'neko-nocturno',
    name: 'Neko Nocturno de Fernanda',
    badge: 'Michi de Fernanda · Azul Noche',
    signature: 'Michi Blanco Atigrado HD · Luna & Faroles · Rojo Cereza',
    description:
      'Inspirado en la foto real del michi blanco y atigrado con manchita en la nariz de Fernanda: fondo ilustrado nocturno con luna creciente y faroles, paneles cristal marfil-azulado y lluvia gatuna al cobrar.',
    audience: 'ellas',
    config: {
      mode: 'glass',
      accent: 'crimson',
      shape: 'soft',
      cardFinish: 'neo',
      fontStyle: 'rounded',
      pattern: 'none',
      catDesign: 'white-tabby',
    },
    paletteOverrides: {
      canvas: '#1e2f4d',
      canvasGlow: 'none',
      canvasImage: `url("${NEKO_FERNANDA_LOCAL_WALLPAPER}")`,
      panelBg: 'rgba(248, 251, 255, 0.80)',
      panelSubBg: 'rgba(238, 244, 252, 0.58)',
      cardBg: 'rgba(255, 255, 255, 0.94)',
      inputBg: '#ffffff',
      toolbarBg:
        'linear-gradient(95deg, rgba(244, 248, 255, 0.90) 0%, rgba(255, 238, 242, 0.88) 52%, rgba(240, 246, 255, 0.90) 100%)',
      toolbarTone: 'light',
      tabbarBg: 'rgba(245, 249, 255, 0.86)',
      ink: '#1e293b',
      inkStrong: '#0f172a',
      muted: '#475569',
      line: '#f4a3b4',
    },
  },
  {
    id: 'capy-matcha',
    name: 'Capybara Onsen & Matcha Latte',
    badge: 'Kyoto Onsen & Yuzu',
    signature: 'Capibaras con mandarina · Té Matcha HD · Lluvia Onsen',
    description:
      'Inspirado en aguas termales japonesas y casas de té matcha: capibaras relajados con mandarinas yuzu sobre la cabeza, paneles crema-pistacho con blur sedoso y lluvia de capibaras al cobrar.',
    audience: 'ellas',
    config: {
      mode: 'glass',
      accent: 'matcha',
      shape: 'soft',
      cardFinish: 'neo',
      fontStyle: 'rounded',
      pattern: 'none',
    },
    paletteOverrides: {
      canvas: '#d5e5cb',
      canvasGlow: 'none',
      canvasImage: 'url("/pos/wallpapers/capy-matcha-hd.jpg")',
      panelBg: 'rgba(248, 253, 249, 0.80)',
      panelSubBg: 'rgba(236, 248, 239, 0.58)',
      cardBg: 'rgba(255, 255, 255, 0.94)',
      inputBg: '#ffffff',
      toolbarBg:
        'linear-gradient(90deg, rgba(235, 248, 238, 0.88) 0%, rgba(224, 243, 229, 0.88) 50%, rgba(238, 249, 240, 0.88) 100%)',
      toolbarTone: 'light',
      tabbarBg: 'rgba(238, 249, 240, 0.84)',
      ink: '#1e422b',
      inkStrong: '#102b1a',
      muted: '#4d7a5c',
      line: '#95cfa8',
    },
  },
  {
    id: 'jasmine-lavender',
    name: 'Princesa Jazmín & Oasis de Agrabah',
    badge: 'Edición Ilustrada · Agrabah',
    signature: 'Turquesa Oasis · Oro Real & Lámpara Mágica · Fondo Ilustrado HD',
    description:
      'Palacio de Agrabah con fondo ilustrado en alta resolución, lámpara mágica dorada, gemas turquesa real, flores de jazmín y lluvia mágica al cobrar.',
    audience: 'ellas',
    config: {
      mode: 'glass',
      accent: 'jasmine',
      shape: 'soft',
      cardFinish: 'neo',
      fontStyle: 'rounded',
      pattern: 'none',
    },
    paletteOverrides: {
      canvas: '#ccf2f0',
      canvasGlow: 'none',
      canvasImage: `url("${JASMINE_LOCAL_WALLPAPER}")`,
      panelBg: 'rgba(247, 254, 253, 0.78)',
      panelSubBg: 'rgba(232, 250, 248, 0.62)',
      cardBg: 'rgba(255, 255, 255, 0.94)',
      inputBg: '#ffffff',
      toolbarBg:
        'linear-gradient(95deg, rgba(230, 250, 248, 0.9) 0%, rgba(215, 245, 242, 0.88) 52%, rgba(243, 238, 255, 0.9) 100%)',
      toolbarTone: 'light',
      tabbarBg: 'rgba(236, 252, 250, 0.86)',
      ink: '#134e4a',
      inkStrong: '#092e2c',
      muted: '#2d6e69',
      line: '#67e0d6',
    },
  },
  {
    id: 'asistora-original',
    name: 'Asistora Clásico Oficial',
    badge: 'Fábrica Importadora Carlitos',
    signature: 'Estándar original sin modificaciones',
    description:
      'El diseño de fábrica original de Asistora en verde esmeralda y superficies blancas estándar.',
    audience: 'unisex',
    config: {
      mode: 'light',
      accent: 'emerald',
      shape: 'modern',
      cardFinish: 'clean',
      fontStyle: 'modern',
      pattern: 'none',
    },
  },
];

export const DEFAULT_POS_PERSONAL_THEME: PosPersonalTheme = {
  version: 2,
  presetId: 'asistora-original',
  mode: 'light',
  accent: 'emerald',
  shape: 'modern',
  cardFinish: 'clean',
  fontStyle: 'modern',
  pattern: 'none',
};

export function presetToPersonalTheme(preset: PosThemePreset): PosPersonalTheme {
  return {
    version: 2,
    presetId: preset.id,
    ...preset.config,
  };
}

const POS_NEKO_COLOR_KEYS: PosNekoColorKey[] = [
  'fur', 'markings', 'muzzle', 'innerEar', 'eyes', 'nose', 'collar',
  'accent', 'accent2', 'canvas', 'panelBg', 'panelSubBg', 'cardBg', 'inputBg',
  'toolbarBg', 'tabbarBg', 'ink', 'inkStrong', 'muted', 'line',
];

function normalizePosThemeCustomColors(value: unknown): PosThemeCustomColors | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const colors: PosThemeCustomColors = {};
  for (const key of POS_NEKO_COLOR_KEYS) {
    const color = source[key];
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      colors[key] = color.toLowerCase();
    }
  }
  return Object.keys(colors).length > 0 ? colors : undefined;
}

/**
 * Normalizes both v2 themes and legacy v1 themes (`{ background, accent, flowers }`)
 * stored in `pos_cashier_profiles`.
 */
export function normalizePosPersonalTheme(value: unknown): PosPersonalTheme {
  if (!value || typeof value !== 'object') return DEFAULT_POS_PERSONAL_THEME;
  const raw = value as Record<string, unknown>;

  if (raw.version !== 2 && ('background' in raw || 'flowers' in raw)) {
    const bg = String(raw.background || 'original');
    const oldAccent = String(raw.accent || 'emerald');
    const flowers = raw.flowers === true;

    if (bg === 'rose' || oldAccent === 'rose' || flowers) {
      const base = presetToPersonalTheme(POS_THEME_PRESETS.find(p => p.id === 'sakura-coquette')!);
      return { ...base, pattern: 'none' };
    }
    return DEFAULT_POS_PERSONAL_THEME;
  }

  const validModes: PosSurfaceMode[] = ['light', 'tinted', 'glass', 'contrast-header', 'dark'];
  const validShapes: PosShapeStyle[] = ['sharp', 'modern', 'soft'];
  const validFinishes: PosCardFinish[] = ['clean', 'glass', 'accent-stripe', 'neo'];
  const validFonts: PosFontStyle[] = ['modern', 'rounded', 'editorial', 'tech'];
  const validCatDesigns: PosNekoDesign[] = ['white-tabby', 'orange-tabby', 'tuxedo'];
  const validPatterns: PosPatternId[] = [
    'none', 'sakura', 'neko', 'coquette', 'botanical', 'aurora', 'carbon', 'hud-grid', 'constellation', 'luxe-geo', 'jasmine',
  ];

  const preset = POS_THEME_PRESETS.find(item => item.id === raw.presetId);
  if (!preset && raw.presetId !== 'custom') {
    return DEFAULT_POS_PERSONAL_THEME;
  }
  const fallback = preset ? preset.config : DEFAULT_POS_PERSONAL_THEME;

  const rawCustomColors = normalizePosThemeCustomColors(raw.customColors);
  const isLegacyNocturnoDefault =
    (preset?.id === 'neko-nocturno' || raw.presetId === 'neko-nocturno') &&
    rawCustomColors?.canvas === '#09172c' &&
    rawCustomColors?.panelBg === '#fdfdff';

  const normalized: PosPersonalTheme = {
    version: 2,
    presetId: preset ? preset.id : 'custom',
    mode: validModes.includes(raw.mode as PosSurfaceMode) ? (raw.mode as PosSurfaceMode) : fallback.mode,
    accent:
      preset?.id === 'jasmine-lavender' || raw.presetId === 'jasmine-lavender'
        ? 'jasmine'
        : Object.prototype.hasOwnProperty.call(POS_ACCENT_PALETTES, String(raw.accent || ''))
        ? (raw.accent as PosAccentId)
        : fallback.accent,
    shape: validShapes.includes(raw.shape as PosShapeStyle) ? (raw.shape as PosShapeStyle) : fallback.shape,
    cardFinish: validFinishes.includes(raw.cardFinish as PosCardFinish)
      ? (raw.cardFinish as PosCardFinish)
      : fallback.cardFinish,
    fontStyle: validFonts.includes(raw.fontStyle as PosFontStyle)
      ? (raw.fontStyle as PosFontStyle)
      : fallback.fontStyle,
    pattern:
      preset?.id === 'sakura-coquette' ||
      raw.presetId === 'sakura-coquette' ||
      preset?.id === 'capy-matcha' ||
      raw.presetId === 'capy-matcha' ||
      preset?.id === 'jasmine-lavender' ||
      raw.presetId === 'jasmine-lavender' ||
      isLegacyNocturnoDefault
        ? 'none'
        : validPatterns.includes(raw.pattern as PosPatternId)
        ? (raw.pattern as PosPatternId)
        : fallback.pattern,
    catDesign: validCatDesigns.includes(raw.catDesign as PosNekoDesign)
      ? (raw.catDesign as PosNekoDesign)
      : fallback.catDesign,
    customColors: isLegacyNocturnoDefault ? undefined : rawCustomColors,
  };

  return normalized;
}

export function isDefaultPosTheme(theme: PosPersonalTheme): boolean {
  return (
    theme.presetId === 'asistora-original' &&
    theme.mode === 'light' &&
    theme.accent === 'emerald' &&
    theme.shape === 'modern' &&
    theme.cardFinish === 'clean' &&
    theme.fontStyle === 'modern' &&
    theme.pattern === 'none'
  );
}

function readableTextForHex(hex: string): string {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '#ffffff';
  const channels = [0, 2, 4].map(index => {
    const value = parseInt(normalized.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.52 ? '#182235' : '#ffffff';
}

function buildPatternDataUri(pattern: PosPatternId, isDark: boolean, accentHex: string): string | undefined {
  const stroke = isDark ? 'rgba(255,255,255,0.085)' : 'rgba(15,23,42,0.075)';
  const accentAlpha = isDark ? '0.26' : '0.24';

  switch (pattern) {
    case 'sakura': {
      // Rich 5-petal cherry blossom + falling petals + golden center + starlight sparkles
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="132" height="132" viewBox="0 0 132 132"><g fill="${accentHex}" fill-opacity="${accentAlpha}"><g transform="translate(34,34)"><ellipse cx="0" cy="-11" rx="5.5" ry="10"/><ellipse cx="10.5" cy="-3.4" rx="5.5" ry="10" transform="rotate(72 10.5 -3.4)"/><ellipse cx="6.5" cy="9" rx="5.5" ry="10" transform="rotate(144 6.5 9)"/><ellipse cx="-6.5" cy="9" rx="5.5" ry="10" transform="rotate(216 -6.5 9)"/><ellipse cx="-10.5" cy="-3.4" rx="5.5" ry="10" transform="rotate(288 -10.5 -3.4)"/><circle cx="0" cy="0" r="3.6" fill="#fbbf24" fill-opacity="0.65"/></g><g transform="translate(98,94) scale(0.72)"><ellipse cx="0" cy="-11" rx="5.5" ry="10"/><ellipse cx="10.5" cy="-3.4" rx="5.5" ry="10" transform="rotate(72 10.5 -3.4)"/><ellipse cx="6.5" cy="9" rx="5.5" ry="10" transform="rotate(144 6.5 9)"/><ellipse cx="-6.5" cy="9" rx="5.5" ry="10" transform="rotate(216 -6.5 9)"/><ellipse cx="-10.5" cy="-3.4" rx="5.5" ry="10" transform="rotate(288 -10.5 -3.4)"/><circle cx="0" cy="0" r="3.6" fill="#fbbf24" fill-opacity="0.6"/></g><path d="M96 28c5-4 11 1 7 7-3 4-9 5-9 5s-2-8 2-12z"/><path d="M28 98c4-5 10-2 8 4-2 5-8 7-8 7s-4-6 0-11z"/><path d="M68 62l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill-opacity="0.32"/></g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'neko': {
      // Cat paw prints (toe beans) + mini kitty silhouette + collar bells
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g fill="${accentHex}" fill-opacity="${accentAlpha}"><g transform="translate(34,36) rotate(-18)"><ellipse cx="0" cy="4" rx="7.5" ry="6"/><ellipse cx="-7.5" cy="-5" rx="3" ry="4" transform="rotate(-20 -7.5 -5)"/><ellipse cx="-2.5" cy="-8" rx="3" ry="4.2"/><ellipse cx="2.5" cy="-8" rx="3" ry="4.2"/><ellipse cx="7.5" cy="-5" rx="3" ry="4" transform="rotate(20 7.5 -5)"/></g><g transform="translate(94,92) rotate(22) scale(0.84)"><ellipse cx="0" cy="4" rx="7.5" ry="6"/><ellipse cx="-7.5" cy="-5" rx="3" ry="4" transform="rotate(-20 -7.5 -5)"/><ellipse cx="-2.5" cy="-8" rx="3" ry="4.2"/><ellipse cx="2.5" cy="-8" rx="3" ry="4.2"/><ellipse cx="7.5" cy="-5" rx="3" ry="4" transform="rotate(20 7.5 -5)"/></g><path d="M84 26 L88 17 L93 24 Q96 23 99 24 L104 17 L108 26 A11 9.5 0 1 1 84 26 Z" fill-opacity="0.18"/></g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'coquette': {
      // Satin ribbon bows with flowing tails + delicate hearts + pearls
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124"><g stroke="${accentHex}" stroke-opacity="${accentAlpha}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(34,34)"><path d="M0 0 C-14 -12, -20 6, -2 4 Z" fill="${accentHex}" fill-opacity="0.14"/><path d="M0 0 C14 -12, 20 6, 2 4 Z" fill="${accentHex}" fill-opacity="0.14"/><path d="M-2 4 C-6 13, -11 17, -14 21"/><path d="M2 4 C6 13, 11 17, 14 21"/><circle cx="0" cy="1.5" r="2.6" fill="${accentHex}" fill-opacity="0.3"/></g><path d="M92 84c-4.5-5.5-12-1-8.5 5.5 2.8 4.8 8.5 8.5 8.5 8.5s5.7-3.7 8.5-8.5c3.5-6.5-4-11-8.5-5.5z" fill="${accentHex}" fill-opacity="0.15"/><circle cx="90" cy="30" r="2" fill="${accentHex}" fill-opacity="0.26" stroke="none"/><circle cx="34" cy="94" r="2" fill="${accentHex}" fill-opacity="0.26" stroke="none"/></g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'botanical': {
      // Kyoto sage/matcha branches with veined leaves
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><g fill="none" stroke="${accentHex}" stroke-opacity="${accentAlpha}" stroke-width="1.5" stroke-linecap="round"><path d="M22 122 C40 88, 68 62, 108 42"/><path d="M46 94 C42 76, 54 64, 70 66 C68 82, 58 92, 46 94 Z" fill="${accentHex}" fill-opacity="0.14"/><path d="M72 70 C84 56, 100 58, 108 70 C94 78, 80 76, 72 70 Z" fill="${accentHex}" fill-opacity="0.14"/><path d="M56 104 C70 100, 82 106, 86 118 C72 120, 60 114, 56 104 Z" fill="${accentHex}" fill-opacity="0.11"/><circle cx="114" cy="108" r="2.5" fill="${accentHex}" fill-opacity="0.24" stroke="none"/><circle cx="34" cy="36" r="2" fill="${accentHex}" fill-opacity="0.2" stroke="none"/></g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'aurora': {
      // Flowing iridescent silk ribbons + stars
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><path d="M0 54 Q45 24 90 54 T180 54" fill="none" stroke="${accentHex}" stroke-opacity="0.24" stroke-width="1.8"/><path d="M0 124 Q45 94 90 124 T180 124" fill="none" stroke="#ec4899" stroke-opacity="0.18" stroke-width="1.4"/><path d="M52 90l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="${accentHex}" fill-opacity="0.26"/><path d="M138 36l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#38bdf8" fill-opacity="0.3"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'carbon': {
      // Authentic 3D diagonal twill carbon-fiber weave
      const hi = isDark ? 'rgba(255,255,255,0.065)' : 'rgba(15,23,42,0.06)';
      const mid = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.025)';
      const lo = isDark ? 'rgba(0,0,0,0.42)' : 'rgba(15,23,42,0.11)';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="${lo}"/><polygon points="0,0 8,0 8,8 0,8" fill="${hi}"/><polygon points="8,8 16,8 16,16 8,16" fill="${hi}"/><polygon points="0,0 8,0 0,8" fill="${mid}"/><polygon points="8,8 16,8 8,16" fill="${mid}"/><line x1="0" y1="8" x2="16" y2="8" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/><line x1="8" y1="0" x2="8" y2="16" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'hud-grid': {
      // Avionics / Industrial precision grid with fiducial crosshairs
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><path d="M56 0H0v56" fill="none" stroke="${stroke}" stroke-width="1"/><path d="M28 24v8M24 28h8" stroke="${accentHex}" stroke-opacity="0.28" stroke-width="1.2"/><circle cx="0" cy="0" r="1.5" fill="${accentHex}" fill-opacity="0.32"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'constellation': {
      // Horological dial vectors + gold/starlight nodes
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="148" viewBox="0 0 148 148"><g stroke="${accentHex}" stroke-opacity="0.24" stroke-width="1"><line x1="26" y1="32" x2="74" y2="54"/><line x1="74" y1="54" x2="118" y2="28"/><line x1="74" y1="54" x2="90" y2="112"/><circle cx="74" cy="54" r="14" fill="none" stroke-dasharray="2 3"/></g><g fill="${accentHex}" fill-opacity="0.45"><circle cx="26" cy="32" r="2.4"/><circle cx="74" cy="54" r="3"/><circle cx="118" cy="28" r="2.2"/><circle cx="90" cy="112" r="2.4"/></g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'luxe-geo': {
      // Art-Déco double diamond vault filigree
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><g fill="none" stroke="${accentHex}" stroke-opacity="0.22" stroke-width="1.1"><path d="M40 4L76 40L40 76L4 40Z"/><path d="M40 14L66 40L40 66L14 40Z" stroke-opacity="0.14"/><circle cx="40" cy="40" r="3.5" fill="${accentHex}" fill-opacity="0.22"/></g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    case 'jasmine': {
      // Original palace arches, an eight-point star, and a turquoise jewel.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><g fill="none" stroke="${accentHex}" stroke-opacity="${accentAlpha}" stroke-width="1.5"><path d="M18 118V76a54 54 0 0 1 108 0v42M31 118V78a41 41 0 0 1 82 0v40"/><path d="M72 18l6 16 16-6-6 16 16 6-16 6 6 16-16-6-6 16-6-16-16 6 6-16-16-6 16-6-6-16 16 6z" fill="${accentHex}" fill-opacity="0.13"/><path d="M72 45l9 12-9 13-9-13z" fill="#5bc9c2" fill-opacity="0.30" stroke="#5bc9c2" stroke-opacity="0.52"/><circle cx="28" cy="31" r="2" fill="#d6ad55" stroke="none"/><circle cx="116" cy="110" r="2.4" fill="#d6ad55" stroke="none"/><path d="M44 111h56M52 119h40" stroke="#d6ad55" stroke-opacity="0.28"/></g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    default:
      return undefined;
  }
}

export function resolvePosSkinTokens(
  theme: PosPersonalTheme,
  cachedWallpaperUri?: string
): {
  style: CSSProperties;
  isCustom: boolean;
  isDark: boolean;
  toolbarTone: 'light' | 'dark';
} {
  const accent = POS_ACCENT_PALETTES[theme.accent] || POS_ACCENT_PALETTES.emerald;
  const customColors = theme.customColors || {};
  const accentColor = customColors.accent || accent.color;
  const accentColor2 = customColors.accent2 || accent.color2;
  const accentLightSoft = customColors.accent
    ? `color-mix(in srgb, ${accentColor} 14%, #ffffff)`
    : accent.lightSoft;
  const accentLightBorder = customColors.accent
    ? `color-mix(in srgb, ${accentColor} 42%, #ffffff)`
    : accent.lightBorder;
  const accentGlow = customColors.accent
    ? `color-mix(in srgb, ${accentColor} 28%, transparent)`
    : accent.glow;
  const matchedPreset = POS_THEME_PRESETS.find(item => item.id === theme.presetId);
  const overrides = matchedPreset ? matchedPreset.paletteOverrides : undefined;

  const isDark = theme.mode === 'dark';
  const isCustom = !isDefaultPosTheme(theme);

  const radii =
    theme.shape === 'sharp'
      ? { panel: '5px', card: '4px', control: '4px', pill: '5px' }
      : theme.shape === 'soft'
      ? { panel: '22px', card: '18px', control: '14px', pill: '999px' }
      : { panel: '14px', card: '11px', control: '10px', pill: '10px' };

  const fonts =
    theme.fontStyle === 'rounded'
      ? {
          body: "'Quicksand', 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
          display: "'Quicksand', 'Plus Jakarta Sans', system-ui, sans-serif",
        }
      : theme.fontStyle === 'editorial'
      ? {
          body: "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
          display: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
        }
      : theme.fontStyle === 'tech'
      ? {
          body: "'Chakra Petch', 'Space Grotesk', 'Bahnschrift', system-ui, sans-serif",
          display: "'Chakra Petch', 'Space Grotesk', 'Consolas', monospace",
        }
      : {
          body: "'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
          display: "'Space Grotesk', 'Plus Jakarta Sans', system-ui, sans-serif",
        };

  let canvas = '#f4f6f3';
  let canvasGlow = 'none';
  let panelBg = '#ffffff';
  let panelSubBg = '#f5f7f3';
  let cardBg = '#ffffff';
  let inputBg = '#ffffff';
  let toolbarBg = '#ffffff';
  let toolbarTone: 'light' | 'dark' = 'light';
  let tabbarBg = '#f9fbf8';
  let ink = '#334155';
  let inkStrong = '#0f172a';
  let muted = '#64748b';
  let line = '#dce5e0';

  if (theme.mode === 'tinted') {
    canvas = accentLightSoft;
    canvasGlow = `radial-gradient(circle at 12% 16%, ${accentGlow}, transparent 45%)`;
    panelBg = `color-mix(in srgb, ${accentLightSoft} 55%, #ffffff)`;
    panelSubBg = accentLightSoft;
    cardBg = `color-mix(in srgb, ${accentLightSoft} 22%, #ffffff)`;
    inputBg = '#ffffff';
    toolbarBg = `linear-gradient(90deg, #ffffff 0%, ${accentLightSoft} 100%)`;
    tabbarBg = `color-mix(in srgb, ${accentLightSoft} 68%, #ffffff)`;
    line = accentLightBorder;
  } else if (theme.mode === 'glass') {
    canvas = accentLightSoft;
    canvasGlow = `radial-gradient(circle at 14% 18%, ${accentGlow}, transparent 44%), radial-gradient(circle at 86% 82%, ${accentGlow}, transparent 46%)`;
    panelBg = 'rgba(255, 255, 255, 0.68)';
    panelSubBg = 'rgba(255, 255, 255, 0.52)';
    cardBg = 'rgba(255, 255, 255, 0.82)';
    inputBg = 'rgba(255, 255, 255, 0.92)';
    toolbarBg = 'rgba(255, 255, 255, 0.78)';
    tabbarBg = 'rgba(255, 255, 255, 0.68)';
    line = accentLightBorder;
  } else if (theme.mode === 'contrast-header') {
    canvas = accentLightSoft;
    panelBg = `color-mix(in srgb, ${accentLightSoft} 45%, #ffffff)`;
    panelSubBg = `color-mix(in srgb, ${accentLightSoft} 75%, #ffffff)`;
    cardBg = `color-mix(in srgb, ${accentLightSoft} 18%, #ffffff)`;
    inputBg = '#ffffff';
    toolbarBg = `linear-gradient(120deg, ${accentColor} 0%, ${accentColor2} 100%)`;
    toolbarTone = 'dark';
    tabbarBg = `color-mix(in srgb, ${accentLightSoft} 60%, #ffffff)`;
    line = accentLightBorder;
  } else if (theme.mode === 'dark') {
    canvas = '#0a0f1a';
    canvasGlow = `radial-gradient(circle at 16% 14%, ${accentGlow}, transparent 42%)`;
    panelBg = '#121b2d';
    panelSubBg = '#0d1423';
    cardBg = '#18243b';
    inputBg = '#0c1321';
    toolbarBg = 'linear-gradient(90deg, #0d1526 0%, #16233b 100%)';
    toolbarTone = 'dark';
    tabbarBg = '#0f182a';
    ink = '#e2e8f0';
    inkStrong = '#f8fafc';
    muted = '#94a3b8';
    line = '#263654';
  }

  if (overrides) {
    if (overrides.canvas) canvas = overrides.canvas;
    if (overrides.canvasGlow) canvasGlow = overrides.canvasGlow;
    if (overrides.panelBg) panelBg = overrides.panelBg;
    if (overrides.panelSubBg) panelSubBg = overrides.panelSubBg;
    if (overrides.cardBg) cardBg = overrides.cardBg;
    if (overrides.inputBg) inputBg = overrides.inputBg;
    if (overrides.toolbarBg) toolbarBg = overrides.toolbarBg;
    if (overrides.toolbarTone) toolbarTone = overrides.toolbarTone;
    if (overrides.tabbarBg) tabbarBg = overrides.tabbarBg;
    if (overrides.ink) ink = overrides.ink;
    if (overrides.inkStrong) inkStrong = overrides.inkStrong;
    if (overrides.muted) muted = overrides.muted;
    if (overrides.line) line = overrides.line;
  }

  if (customColors.canvas) canvas = customColors.canvas;
  if (customColors.panelBg) panelBg = customColors.panelBg;
  if (customColors.panelSubBg) panelSubBg = customColors.panelSubBg;
  if (customColors.cardBg) cardBg = customColors.cardBg;
  if (customColors.inputBg) inputBg = customColors.inputBg;
  if (customColors.toolbarBg) toolbarBg = customColors.toolbarBg;
  if (customColors.tabbarBg) tabbarBg = customColors.tabbarBg;
  if (customColors.ink) ink = customColors.ink;
  if (customColors.inkStrong) inkStrong = customColors.inkStrong;
  if (customColors.muted) muted = customColors.muted;
  if (customColors.line) line = customColors.line;

  const patternUri = buildPatternDataUri(theme.pattern, isDark, accentColor);
  const hasCustomCanvasOverride = Boolean(customColors.canvas) || theme.pattern !== 'none';

  const isMikanWallpaper = theme.presetId === 'neko-mikan';
  const isFernandaWallpaper = theme.presetId === 'neko-nocturno';
  const isCapyPreset = theme.presetId === 'capy-matcha';
  const isSakuraPreset = theme.presetId === 'sakura-coquette';
  const isJasminePreset = theme.presetId === 'jasmine-lavender';
  const validCachedWallpaper = cachedWallpaperUri &&
    (cachedWallpaperUri.startsWith('data:image') || cachedWallpaperUri.startsWith('http') || cachedWallpaperUri.startsWith('/'))
      ? cachedWallpaperUri
      : undefined;
  const wallpaperUri = isMikanWallpaper
    ? (validCachedWallpaper || getCachedNekoWallpaper())
    : isFernandaWallpaper
      ? (validCachedWallpaper || getCachedNekoFernandaWallpaper())
      : isCapyPreset
        ? (validCachedWallpaper || getCachedCapyWallpaper())
        : isSakuraPreset
          ? (validCachedWallpaper || getCachedSakuraWallpaper())
          : isJasminePreset
            ? (validCachedWallpaper || getCachedJasmineWallpaper())
            : '';

  let baseCanvasImage: string | undefined;
  if (theme.presetId === 'sakura-coquette') {
    if (wallpaperUri.startsWith('data:image')) {
      baseCanvasImage = `url("${wallpaperUri}")`;
    } else {
      baseCanvasImage = `url("${wallpaperUri}"), url("${SAKURA_LOCAL_WALLPAPER}")`;
    }
  } else if (theme.presetId === 'neko-mikan' && !hasCustomCanvasOverride) {
    if (wallpaperUri.startsWith('data:image')) {
      baseCanvasImage = `url("${wallpaperUri}")`;
    } else {
      baseCanvasImage = `url("${wallpaperUri}"), url("${NEKO_LOCAL_WALLPAPER}")`;
    }
  } else if (theme.presetId === 'neko-nocturno' && !hasCustomCanvasOverride) {
    if (wallpaperUri.startsWith('data:image')) {
      baseCanvasImage = `url("${wallpaperUri}")`;
    } else {
      baseCanvasImage = `url("${wallpaperUri}"), url("${NEKO_FERNANDA_LOCAL_WALLPAPER}")`;
    }
  } else if (isPosNekoTheme(theme.presetId) && hasCustomCanvasOverride) {
    baseCanvasImage = patternUri;
  } else if (theme.presetId === 'capy-matcha') {
    if (wallpaperUri.startsWith('data:image')) {
      baseCanvasImage = `url("${wallpaperUri}")`;
    } else {
      baseCanvasImage = `url("${wallpaperUri}"), url("${CAPY_LOCAL_WALLPAPER}")`;
    }
  } else if (theme.presetId === 'jasmine-lavender') {
    if (wallpaperUri.startsWith('data:image')) {
      baseCanvasImage = `url("${wallpaperUri}")`;
    } else {
      baseCanvasImage = `url("${wallpaperUri}"), url("${JASMINE_LOCAL_WALLPAPER}")`;
    }
  } else if (theme.pattern !== 'none') {
    baseCanvasImage = patternUri;
  } else if (overrides?.canvasImage) {
    baseCanvasImage = overrides.canvasImage;
  }

  const canvasBgLayers = [baseCanvasImage, canvasGlow !== 'none' ? canvasGlow : undefined].filter(Boolean);

  const soft = isDark
    ? (customColors.accent ? `color-mix(in srgb, ${accentColor} 20%, transparent)` : accent.darkSoft)
    : (customColors.accent ? `color-mix(in srgb, ${accentColor} 13%, #ffffff)` : accent.lightSoft);
  const accentBorder = customColors.line || (isDark ? accent.darkBorder : accentLightBorder);
  const accentText = customColors.accent
    ? `color-mix(in srgb, ${accentColor} 84%, #101827)`
    : (isDark ? accent.darkText : accent.lightText);
  const contrastText = readableTextForHex(accentColor);
  const catColors = getPosNekoCatColors(theme.catDesign, customColors);

  const cardShadow =
    theme.cardFinish === 'neo'
      ? isDark
        ? `0 3px 0 0 ${accentBorder}, 0 10px 22px rgba(0,0,0,0.38)`
        : `0 3px 0 0 ${accentBorder}, 0 8px 18px rgba(15,23,42,0.06)`
      : theme.cardFinish === 'glass'
      ? isDark
        ? '0 10px 26px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.12)'
        : '0 8px 24px rgba(15,23,42,0.06), inset 0 1.5px 0 rgba(255,255,255,0.92)'
      : isDark
      ? '0 6px 16px rgba(0,0,0,0.3)'
      : '0 3px 10px rgba(15,23,42,0.045)';

  const style: CSSProperties = {
    '--pos-ink': isCustom ? ink : '#405566',
    '--pos-ink-strong': isCustom ? inkStrong : '#1e293b',
    '--pos-muted': isCustom ? muted : '#61736f',
    '--pos-accent': accentColor,
    '--pos-accent-2': accentColor2,
    '--pos-accent-gradient': `linear-gradient(135deg, ${accentColor} 0%, ${accentColor2} 100%)`,
    '--pos-accent-contrast': customColors.accent ? contrastText : accent.contrastText,
    '--pos-soft': soft,
    '--pos-personal-accent': accentColor,
    '--pos-personal-accent-soft': soft,
    '--pos-personal-accent-text': accentText,
    '--pos-personal-accent-border': accentBorder,
    '--pos-canvas': canvas,
    '--pos-canvas-image': canvasBgLayers.length > 0 ? canvasBgLayers.join(', ') : 'none',
    '--pos-sakura-wallpaper':
      theme.presetId === 'sakura-coquette'
        ? baseCanvasImage || `url("${SAKURA_REMOTE_WALLPAPER}")`
        : undefined,
    '--pos-neko-wallpaper':
      theme.presetId === 'neko-mikan' || theme.presetId === 'neko-nocturno'
        ? (baseCanvasImage || 'none')
        : undefined,
    '--pos-capy-wallpaper':
      theme.presetId === 'capy-matcha'
        ? baseCanvasImage || `url("${CAPY_LOCAL_WALLPAPER}")`
        : undefined,
    '--pos-jasmine-wallpaper':
      theme.presetId === 'jasmine-lavender'
        ? baseCanvasImage || `url("${JASMINE_LOCAL_WALLPAPER}")`
        : undefined,
    '--pos-panel-bg': panelBg,
    '--pos-panel-sub-bg': panelSubBg,
    '--pos-card-bg': cardBg,
    '--pos-input-bg': inputBg,
    '--pos-line': line,
    '--pos-toolbar-bg': toolbarBg,
    '--pos-toolbar-ink': toolbarTone === 'dark' ? '#f8fafc' : inkStrong,
    '--pos-toolbar-muted': toolbarTone === 'dark' ? 'rgba(241, 245, 249, 0.78)' : muted,
    '--pos-toolbar-line': toolbarTone === 'dark' ? 'rgba(255, 255, 255, 0.16)' : line,
    '--pos-tabbar-bg': tabbarBg,
    '--pos-radius-panel': radii.panel,
    '--pos-radius-card': radii.card,
    '--pos-radius-control': radii.control,
    '--pos-radius-pill': radii.pill,
    '--pos-card-shadow': cardShadow,
    '--pos-charge-shadow': `0 8px 24px ${accentGlow}`,
    '--pos-cat-fur': catColors.fur,
    '--pos-cat-markings': catColors.markings,
    '--pos-cat-muzzle': catColors.muzzle,
    '--pos-cat-inner-ear': catColors.innerEar,
    '--pos-cat-eyes': catColors.eyes,
    '--pos-cat-nose': catColors.nose,
    '--pos-cat-collar': catColors.collar,
    '--pos-font-body': fonts.body,
    '--pos-font-display': fonts.display,
  } as CSSProperties;

  return { style, isCustom, isDark, toolbarTone };
}
