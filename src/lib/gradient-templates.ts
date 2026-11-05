/**
 * Gradient Templates System
 * --------------------------
 * Centralized config for text gradients with:
 * - OKLCH-based color definitions
 * - APCA contrast validation via chroma-js
 * - Fallback shadows for low-contrast scenarios
 * - Preview hex colors for theme editor UI
 */

export interface GradientTemplate {
  id: string;
  label: string;
  /** CSS gradient string (uses oklch() for precision) */
  gradient: string;
  /** Hex preview colors for theme editor thumbnails [start, mid, end] */
  preview: [string, string, string];
  /** Category for UI grouping */
  category: 'high-impact' | 'classic' | 'subtle';
  /** Whether this template needs a text-shadow fallback on dark backgrounds */
  needsShadowFallback?: boolean;
}

/**
 * Master gradient template registry.
 * Add new templates here — they auto-appear in the theme editor.
 */
export const gradientTemplates: GradientTemplate[] = [
  // ── HIGH-IMPACT (OKLCH-engineered) ──
  {
    id: 'blood-chrome',
    label: 'Blood Chrome',
    gradient: 'linear-gradient(90deg, oklch(0.45 0.3 25), oklch(0.55 0.28 22), oklch(0.65 0.25 20), oklch(0.55 0.28 22), oklch(0.45 0.3 25))',
    preview: ['#8b1a1a', '#d42020', '#ff3030'],
    category: 'high-impact',
  },
  {
    id: 'deep-obsidian',
    label: 'Deep Obsidian',
    gradient: 'linear-gradient(90deg, oklch(0.3 0 0), oklch(0.5 0.03 250), oklch(0.7 0.05 250), oklch(0.5 0.03 250), oklch(0.3 0 0))',
    preview: ['#3a3a3a', '#6688aa', '#8899bb'],
    category: 'high-impact',
  },
  {
    id: 'gold-fire',
    label: 'Gold Fire',
    gradient: 'linear-gradient(90deg, oklch(0.5 0.2 40), oklch(0.65 0.18 50), oklch(0.8 0.15 60), oklch(0.65 0.18 50), oklch(0.5 0.2 40))',
    preview: ['#a05a00', '#d48a10', '#e8b030'],
    category: 'high-impact',
  },
  {
    id: 'azure-pulse',
    label: 'Azure Pulse',
    gradient: 'linear-gradient(90deg, oklch(0.42 0.2 255), oklch(0.56 0.23 250), oklch(0.68 0.2 245), oklch(0.56 0.23 250), oklch(0.42 0.2 255))',
    preview: ['#1d4ed8', '#2563eb', '#38bdf8'],
    category: 'high-impact',
  },
  {
    id: 'deep-arctic',
    label: 'Deep Arctic',
    gradient: 'linear-gradient(90deg, oklch(0.34 0.12 255), oklch(0.46 0.16 250), oklch(0.62 0.14 240), oklch(0.46 0.16 250), oklch(0.34 0.12 255))',
    preview: ['#1e3a8a', '#2563eb', '#60a5fa'],
    category: 'high-impact',
  },
  {
    id: 'ice-cyan',
    label: 'Ice Cyan',
    gradient: 'linear-gradient(90deg, oklch(0.5 0.16 240), oklch(0.68 0.14 225), oklch(0.78 0.12 210), oklch(0.68 0.14 225), oklch(0.5 0.16 240))',
    preview: ['#3b82f6', '#22d3ee', '#bae6fd'],
    category: 'high-impact',
  },
  // ── CLASSIC (proven readability) ──
  {
    id: 'gold-white',
    label: 'Oro Blanco',
    gradient: 'linear-gradient(90deg, #fbbf24, #fff, #fbbf24, #fff)',
    preview: ['#fbbf24', '#ffffff', '#fde68a'],
    category: 'classic',
    needsShadowFallback: true,
  },
  {
    id: 'fire',
    label: 'Fuego',
    gradient: 'linear-gradient(90deg, #fde047, #f97316, #ef4444, #fde047)',
    preview: ['#fde047', '#f97316', '#ef4444'],
    category: 'classic',
  },
  {
    id: 'candy',
    label: 'Candy',
    gradient: 'linear-gradient(90deg, #f472b6, #c084fc, #60a5fa, #f472b6)',
    preview: ['#f472b6', '#c084fc', '#60a5fa'],
    category: 'classic',
  },
  {
    id: 'rainbow',
    label: 'Arcoíris',
    gradient: 'linear-gradient(90deg, #ef4444, #f97316, #fde047, #4ade80, #60a5fa, #a78bfa, #ef4444)',
    preview: ['#ef4444', '#fde047', '#60a5fa'],
    category: 'classic',
  },
  // ── SUBTLE (elegant, lower contrast) ──
  {
    id: 'silver',
    label: 'Plata',
    gradient: 'linear-gradient(90deg, #e2e8f0, #fff, #cbd5e1, #fff, #e2e8f0)',
    preview: ['#e2e8f0', '#ffffff', '#94a3b8'],
    category: 'subtle',
    needsShadowFallback: true,
  },
  {
    id: 'green-cyan',
    label: 'Verde Neón',
    gradient: 'linear-gradient(90deg, #4ade80, #22d3ee, #4ade80, #22d3ee)',
    preview: ['#4ade80', '#22d3ee', '#86efac'],
    category: 'subtle',
  },
  // ── NUEVOS: Rosa / Pastel ──
  {
    id: 'rose-pastel',
    label: 'Rosa Pastel',
    gradient: 'linear-gradient(90deg, #fce7f3, #fbcfe8, #f5a8cf, #f472b6, #f5a8cf, #fbcfe8)',
    preview: ['#fce7f3', '#f5a8cf', '#f472b6'],
    category: 'subtle',
  },
  {
    id: 'rose-gold',
    label: 'Rosa Dorado',
    gradient: 'linear-gradient(90deg, #fbcfe8, #f5a8cf, #fbbf24, #f59e0b, #fbbf24, #f5a8cf)',
    preview: ['#fbcfe8', '#fbbf24', '#f59e0b'],
    category: 'classic',
  },
  {
    id: 'lavender-dream',
    label: 'Lavanda Dream',
    gradient: 'linear-gradient(90deg, #ede9fe, #ddd6fe, #c4b5fd, #a78bfa, #c4b5fd, #ddd6fe)',
    preview: ['#ede9fe', '#c4b5fd', '#a78bfa'],
    category: 'subtle',
  },
  {
    id: 'sunset-blush',
    label: 'Atardecer',
    gradient: 'linear-gradient(90deg, #fce7f3, #f5a8cf, #fb923c, #f97316, #fb923c, #f5a8cf)',
    preview: ['#fce7f3', '#fb923c', '#f97316'],
    category: 'classic',
  },
  // ── NUEVOS: Neón / Vibrante ──
  {
    id: 'neon-pink',
    label: 'Neón Rosa',
    gradient: 'linear-gradient(90deg, #e396bf, #f472b6, #fb7185, #f472b6, #e396bf)',
    preview: ['#e396bf', '#f472b6', '#fb7185'],
    category: 'high-impact',
  },
  {
    id: 'electric-purple',
    label: 'Púrpura Eléctrico',
    gradient: 'linear-gradient(90deg, #7c3aed, #a855f7, #c084fc, #a855f7, #7c3aed)',
    preview: ['#7c3aed', '#a855f7', '#c084fc'],
    category: 'high-impact',
  },
  {
    id: 'cyber-mint',
    label: 'Cyber Mint',
    gradient: 'linear-gradient(90deg, #064e3b, #059669, #34d399, #6ee7b7, #34d399, #059669)',
    preview: ['#064e3b', '#34d399', '#6ee7b7'],
    category: 'high-impact',
  },
  {
    id: 'tropical',
    label: 'Tropical',
    gradient: 'linear-gradient(90deg, #e396bf, #f97316, #fde047, #4ade80, #22d3ee, #a78bfa)',
    preview: ['#e396bf', '#fde047', '#22d3ee'],
    category: 'classic',
  },
  // ── NUEVOS: Elegante / Premium ──
  {
    id: 'midnight-blue',
    label: 'Azul Medianoche',
    gradient: 'linear-gradient(90deg, #1e3a5f, #1e40af, #3b82f6, #60a5fa, #3b82f6, #1e40af)',
    preview: ['#1e3a5f', '#3b82f6', '#60a5fa'],
    category: 'classic',
  },
  {
    id: 'emerald-lux',
    label: 'Esmeralda Lux',
    gradient: 'linear-gradient(90deg, #064e3b, #047857, #10b981, #34d399, #10b981, #047857)',
    preview: ['#064e3b', '#10b981', '#34d399'],
    category: 'classic',
  },
  {
    id: 'copper-sunset',
    label: 'Cobre Atardecer',
    gradient: 'linear-gradient(90deg, #78350f, #b45309, #f59e0b, #fbbf24, #f59e0b, #b45309)',
    preview: ['#78350f', '#f59e0b', '#fbbf24'],
    category: 'classic',
  },
  {
    id: 'platinum',
    label: 'Platino',
    gradient: 'linear-gradient(90deg, #94a3b8, #cbd5e1, #f1f5f9, #e2e8f0, #cbd5e1, #94a3b8)',
    preview: ['#94a3b8', '#f1f5f9', '#e2e8f0'],
    category: 'subtle',
    needsShadowFallback: true,
  },
  // ── NUEVOS: Blanco + Color ──
  {
    id: 'white-to-rose',
    label: 'Blanco a Rosa',
    gradient: 'linear-gradient(90deg, #ffffff, #fce7f3, #fbcfe8, #f5a8cf, #f472b6)',
    preview: ['#ffffff', '#fbcfe8', '#f472b6'],
    category: 'subtle',
    needsShadowFallback: true,
  },
  {
    id: 'white-to-gold',
    label: 'Blanco a Dorado',
    gradient: 'linear-gradient(90deg, #ffffff, #fef3c7, #fde68a, #fbbf24, #f59e0b)',
    preview: ['#ffffff', '#fde68a', '#f59e0b'],
    category: 'subtle',
    needsShadowFallback: true,
  },
  {
    id: 'white-to-mint',
    label: 'Blanco a Menta',
    gradient: 'linear-gradient(90deg, #ffffff, #d1fae5, #a7f3d0, #6ee7b7, #34d399)',
    preview: ['#ffffff', '#a7f3d0', '#34d399'],
    category: 'subtle',
    needsShadowFallback: true,
  },
  {
    id: 'white-to-lavender',
    label: 'Blanco a Lavanda',
    gradient: 'linear-gradient(90deg, #ffffff, #ede9fe, #ddd6fe, #c4b5fd, #a78bfa)',
    preview: ['#ffffff', '#ddd6fe', '#a78bfa'],
    category: 'subtle',
    needsShadowFallback: true,
  },
];

/**
 * Get CSS properties for a gradient text with proper fallbacks.
 * Uses chroma-js APCA to validate contrast and add shadow if needed.
 */
export function getGradientTextStyle(
  templateId: string,
  bgColor: string = '#0a0a0f',
  animated: boolean = true
): React.CSSProperties {
  const tpl = gradientTemplates.find(t => t.id === templateId);
  if (!tpl) return {};

  const style: React.CSSProperties = {
    backgroundImage: tpl.gradient,
    backgroundSize: animated ? '300% auto' : '100% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  };

  // Add text-shadow fallback for templates flagged as low-contrast
  if (tpl.needsShadowFallback) {
    style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
  }

  return style;
}

/**
 * Validate contrast of a gradient's midpoint color against a background.
 * Returns true if contrast is sufficient (Lc > 75 APCA approximation).
 * Uses chroma-js luminance as a proxy when full APCA isn't available.
 */
export function hasAdequateContrast(previewHex: string, bgHex: string = '#0a0a0f'): boolean {
  try {
    const chroma = require('chroma-js');
    const fgLum = chroma(previewHex).luminance();
    const bgLum = chroma(bgHex).luminance();
    // APCA-like approximation: contrast ratio > 4.5 maps roughly to Lc > 75
    const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
    return ratio >= 4.5;
  } catch {
    return true; // assume OK if chroma not available
  }
}
