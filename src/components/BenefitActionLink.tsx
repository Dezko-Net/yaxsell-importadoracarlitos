'use client';

import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { getBenefitLink } from '@/lib/loyalty-levels';

interface Props {
  benefit: string;
  accentColor: string;
  compact?: boolean;
}

export default function BenefitActionLink({ benefit, accentColor, compact }: Props) {
  const link = getBenefitLink(benefit);
  if (!link) return null;

  const isExternal = link.href.startsWith('http');

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: compact ? '5px 10px' : '6px 12px',
    borderRadius: 8,
    background: '#fff',
    color: accentColor,
    border: `1.5px solid ${accentColor}55`,
    fontSize: compact ? 10 : 11,
    fontWeight: 700,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'background 0.15s ease, border-color 0.15s ease',
  };

  const inner = (
    <>
      {link.label}
      {isExternal ? <ExternalLink size={compact ? 11 : 12} strokeWidth={2.5} /> : <ChevronRight size={compact ? 12 : 13} strokeWidth={2.5} />}
    </>
  );

  if (isExternal) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        style={style}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `${accentColor}0d`;
          e.currentTarget.style.borderColor = accentColor;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#fff';
          e.currentTarget.style.borderColor = `${accentColor}55`;
        }}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      href={link.href}
      style={style}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${accentColor}0d`;
        e.currentTarget.style.borderColor = accentColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#fff';
        e.currentTarget.style.borderColor = `${accentColor}55`;
      }}
    >
      {inner}
    </Link>
  );
}
