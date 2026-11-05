'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  expiresAt: number; // epoch seconds
  label?: string;
  compact?: boolean;
  onExpire?: () => void;
}

export default function CountdownTimer({ expiresAt, label, compact = false, onExpire }: Props) {
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (remaining <= 0) { onExpire?.(); return; }
    const id = setInterval(() => {
      const left = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
      setRemaining(left);
      if (left <= 0) { clearInterval(id); onExpire?.(); }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire, remaining]);

  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (compact) {
    const boxStyle: React.CSSProperties = {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(145deg,#fff,#f8f8f8)', color: '#e94560', borderRadius: 8, minWidth: 42, padding: '5px 7px',
      border: '1px solid #fecdd3', boxShadow: '0 2px 6px rgba(233,69,96,0.1)',
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={boxStyle}>
          <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{pad(hours)}</span>
          <span style={{ fontSize: 7, color: '#bbb', marginTop: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hrs</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#e94560', alignSelf: 'flex-start', marginTop: 3 }}>:</span>
        <div style={boxStyle}>
          <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{pad(minutes)}</span>
          <span style={{ fontSize: 7, color: '#bbb', marginTop: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Min</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#e94560', alignSelf: 'flex-start', marginTop: 3 }}>:</span>
        <div style={boxStyle}>
          <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{pad(seconds)}</span>
          <span style={{ fontSize: 7, color: '#bbb', marginTop: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Seg</span>
        </div>
      </div>
    );
  }

  const boxStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: '#333', color: '#fff', borderRadius: 6, minWidth: 48, padding: '6px 8px',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {label && <span style={{ fontSize: 13, fontWeight: 600, color: '#e53935' }}>{label}</span>}
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={boxStyle}>
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{pad(hours)}</span>
          <span style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>HRS</span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#333', alignSelf: 'flex-start', marginTop: 4 }}>:</span>
        <div style={boxStyle}>
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{pad(minutes)}</span>
          <span style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>MIN</span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#333', alignSelf: 'flex-start', marginTop: 4 }}>:</span>
        <div style={boxStyle}>
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{pad(seconds)}</span>
          <span style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>SEG</span>
        </div>
      </div>
    </div>
  );
}
