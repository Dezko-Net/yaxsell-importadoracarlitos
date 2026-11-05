'use client';

import { getAvatarRingStyle, getLevelMeta } from '@/lib/loyalty-levels';

interface Props {
  avatarUrl: string | null;
  userName?: string;
  size?: number;
  className?: string;
  loyaltyLevelId?: string | null;
}

export default function NavAvatarWithBadge({
  avatarUrl,
  userName,
  size = 36,
  className = '',
  loyaltyLevelId,
}: Props) {
  const levelId = loyaltyLevelId || 'bronze';
  const level = loyaltyLevelId ? getLevelMeta(loyaltyLevelId) : null;
  const badgeSize = Math.round(size * 0.48);
  const initial = userName?.charAt(0).toUpperCase() || 'U';
  const ringVars = getAvatarRingStyle(levelId);
  const outer = size + 6;
  const ringColor = ringVars['--yaxsel-ring-color'];
  const ringGlow = ringVars['--yaxsel-ring-glow'];

  return (
    <div
      className={`yaxsel-nav-avatar-wrap ${className}`.trim()}
      style={{
        position: 'relative',
        width: outer,
        height: outer,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        className="yaxsel-nav-avatar-ring"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `conic-gradient(from 0deg, ${ringColor}, ${ringGlow}, #fff, ${ringColor})`,
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
          boxShadow: `0 0 10px ${ringGlow}`,
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: size,
          height: size,
          zIndex: 1,
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              objectFit: 'cover',
              display: 'block',
              boxSizing: 'border-box',
              border: '2px solid rgba(255,255,255,0.95)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          />
        ) : (
          <span
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              background: `linear-gradient(135deg, ${ringColor}, #fbcfe8)`,
              color: '#fff',
              fontSize: Math.round(size * 0.38),
              fontWeight: 800,
              border: '2px solid rgba(255,255,255,0.95)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            {initial}
          </span>
        )}
        {level?.badge && (
          <img
            src={level.badge}
            alt={level.name}
            title={`Nivel ${level.name}`}
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: badgeSize,
              height: badgeSize,
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
        )}
      </div>
    </div>
  );
}
