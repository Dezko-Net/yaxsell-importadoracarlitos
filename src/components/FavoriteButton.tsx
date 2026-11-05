'use client';

import { useState } from 'react';
import { useFavorites } from '@/context/FavoritesContext';

export interface FavDesign {
  favStyle?: 'circle' | 'rounded' | 'minimal' | 'pill' | 'glassmorphism' | 'neon';
  favBgColor?: string;
  favBgColorActive?: string;
  favIconColor?: string;
  favIconColorActive?: string;
  favSize?: number;
  favAnimation?: 'pulse' | 'bounce' | 'pop' | 'ripple' | 'none';
  favShadow?: boolean;
  favBorder?: boolean;
}

interface Props {
  productId: string;
  size?: number;
  style?: React.CSSProperties;
  design?: FavDesign;
}

export default function FavoriteButton({ productId, size: sizeProp, style, design }: Props) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [animating, setAnimating] = useState(false);
  const active = isFavorite(productId);

  const d = design || {};
  const fStyle = d.favStyle || 'circle';
  const size = sizeProp ?? d.favSize ?? 20;
  const bgOff = d.favBgColor || '#ffffff';
  const bgOn = d.favBgColorActive || '#fff5f5';
  const icOff = d.favIconColor || '#999999';
  const icOn = d.favIconColorActive || '#e53935';
  const anim = d.favAnimation || 'pulse';
  const hasShadow = d.favShadow !== false;
  const hasBorder = d.favBorder !== false;

  const radiusMap: Record<string, string> = {
    circle: '50%', rounded: '8px', minimal: '4px', pill: '50%', glassmorphism: '12px', neon: '6px',
  };
  const radius = radiusMap[fStyle] || '50%';
  const w = fStyle === 'pill' ? size + 24 : size + 14;
  const h = size + 14;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAnimating(true);
    await toggleFavorite(productId);
    setTimeout(() => setAnimating(false), 400);
  }

  const animScale = animating
    ? anim === 'bounce' ? 'scale(1.35)' : anim === 'pop' ? 'scale(1.5)' : anim === 'pulse' ? 'scale(1.25)' : 'scale(1)'
    : 'scale(1)';

  const btnBg = active
    ? fStyle === 'glassmorphism' ? `rgba(255,200,200,0.25)` : bgOn
    : fStyle === 'glassmorphism' ? 'rgba(255,255,255,0.15)' : fStyle === 'neon' ? '#0a0a0a' : bgOff;

  const borderVal = !hasBorder ? 'none'
    : active ? `1.5px solid ${icOn}40`
    : fStyle === 'neon' ? `1px solid ${icOff}44`
    : fStyle === 'glassmorphism' ? '1px solid rgba(255,255,255,0.25)'
    : `1px solid rgba(0,0,0,0.1)`;

  const shadow = !hasShadow ? 'none'
    : active ? `0 2px 10px ${icOn}40, 0 1px 3px rgba(0,0,0,0.08)`
    : fStyle === 'neon' ? `0 0 8px ${icOff}22`
    : '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)';

  return (
    <button
      type="button"
      className="fav-btn"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      title={active ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      style={{
        background: btnBg,
        border: borderVal,
        borderRadius: radius,
        width: w, height: h,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', position: 'relative',
        boxShadow: shadow,
        transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: animScale,
        backdropFilter: fStyle === 'glassmorphism' ? 'blur(12px) saturate(180%)' : undefined,
        WebkitBackdropFilter: fStyle === 'glassmorphism' ? 'blur(12px) saturate(180%)' : undefined,
        padding: 0,
        ...style,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24"
        fill={active ? icOn : 'none'}
        stroke={active ? icOn : icOff}
        strokeWidth={active ? 1.5 : 2}
        strokeLinecap="round" strokeLinejoin="round"
        style={{
          transition: 'all 0.25s ease',
          transform: animating ? 'scale(1.15)' : 'scale(1)',
          filter: active ? `drop-shadow(0 1px 3px ${icOn}50)` : 'none',
        }}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {animating && active && anim !== 'none' && (
        <div style={{
          position: 'absolute', inset: -4, borderRadius: radius,
          border: `2px solid ${icOn}66`,
          animation: anim === 'ripple' ? 'favRipple 0.5s ease-out forwards'
            : anim === 'bounce' ? 'favBounce 0.4s ease-out forwards'
            : 'favPulse 0.4s ease-out forwards',
        }} />
      )}
      <style>{`
        @keyframes favPulse { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(1.4);opacity:0} }
        @keyframes favBounce { 0%{transform:scale(0.5);opacity:1} 50%{transform:scale(1.6);opacity:0.5} 100%{transform:scale(1.3);opacity:0} }
        @keyframes favRipple { 0%{transform:scale(0.6);opacity:1;border-width:3px} 100%{transform:scale(1.8);opacity:0;border-width:0px} }
      `}</style>
    </button>
  );
}
