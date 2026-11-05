'use client';

type Props = {
  percent: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export default function AperturaDiscountBadge({ percent, size = 'md', className = '' }: Props) {
  if (!percent || percent <= 0) return null;

  const sz = size === 'sm'
    ? { pad: '5px 10px', font: 11 }
    : size === 'lg'
      ? { pad: '8px 14px', font: 14 }
      : { pad: '6px 12px', font: 12 };

  return (
    <span
      className={`apertura-disc-badge apertura-disc-badge--${size} ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: sz.pad,
        borderRadius: 999,
        fontSize: sz.font,
        fontWeight: 900,
        letterSpacing: '0.04em',
        color: '#fff',
        background: 'var(--pk-gradient, linear-gradient(135deg, #f5a8cf 0%, #e396bf 50%, #c0547a 100%))',
        boxShadow: 'var(--pk-badge-shadow, 0 2px 8px rgba(227,150,191,0.2), 0 0 0 1px rgba(255,255,255,0.35) inset)',
        textTransform: 'uppercase',
        lineHeight: 1,
        position: 'relative',
        zIndex: 2,
      }}
    >
      <span className="apertura-disc-spark" aria-hidden>✦</span>
      -{percent}%
    </span>
  );
}
