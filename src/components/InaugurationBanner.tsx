'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, PartyPopper, ArrowRight, Ticket } from 'lucide-react';
import { motion } from 'framer-motion';

const PINK = '#e396bf';

type Particle = {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
  drift: number;
};

function buildParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 4,
    duration: 3 + Math.random() * 4,
    opacity: 0.35 + Math.random() * 0.5,
    drift: 8 + Math.random() * 16,
  }));
}

interface Props {
  compact?: boolean;
  href?: string;
}

export default function InaugurationBanner({ compact = false, href = '/ofertas' }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    setParticles(buildParticles(compact ? 28 : 48));
  }, [compact]);

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: compact ? 18 : 24,
        padding: compact ? '18px 16px' : '28px 32px',
        background: 'linear-gradient(135deg, #c0547a 0%, #e396bf 45%, #f43f5e 100%)',
        boxShadow: compact
          ? '0 12px 40px rgba(227,150,191,0.35), inset 0 1px 0 rgba(255,255,255,0.25)'
          : '0 20px 60px rgba(227,150,191,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
      }}
    >
      <style>{`
        @keyframes inag_shimmer {
          0% { transform: translateX(-120%) skewX(-12deg); }
          100% { transform: translateX(220%) skewX(-12deg); }
        }
        .inag-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%);
          animation: inag_shimmer 4s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>

      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.4, 0.25] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: compact ? -40 : -60,
          right: compact ? -30 : -50,
          width: compact ? 140 : 220,
          height: compact ? 140 : 220,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        style={{
          position: 'absolute',
          bottom: compact ? -30 : -50,
          left: compact ? -20 : -40,
          width: compact ? 100 : 180,
          height: compact ? 100 : 180,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
          filter: 'blur(35px)',
          pointerEvents: 'none',
        }}
      />

      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, p.opacity, p.opacity * 0.5, p.opacity],
            scale: [0, 1, 0.7, 1],
            y: [0, -p.drift, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 70%)',
            boxShadow: `0 0 ${p.size * 2}px rgba(255,255,255,0.6)`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <motion.div
        className="inag-shimmer"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />

      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.06) 0%, transparent 40%)',
          pointerEvents: 'none',
        }}
      />

      <motion.div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: compact ? 'flex-start' : 'center',
          gap: compact ? 14 : 24,
          flexWrap: compact ? 'wrap' : 'nowrap',
        }}
      >
        <motion.div
          animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: compact ? 52 : 72,
            height: compact ? 52 : 72,
            borderRadius: compact ? 16 : 20,
            background: 'rgba(255,255,255,0.18)',
            border: '1.5px solid rgba(255,255,255,0.35)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}
        >
          <PartyPopper size={compact ? 26 : 36} color="#fff" strokeWidth={2} />
        </motion.div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.35)',
                fontSize: compact ? 9 : 10,
                fontWeight: 800,
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              <Sparkles size={12} /> Gran inauguración
            </span>
            <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              Importadora Carlitos
            </span>
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: compact ? 18 : 26,
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            ¡Celebramos nuestra apertura!
          </h2>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: compact ? 12 : 14,
              color: 'rgba(255,255,255,0.92)',
              fontWeight: 500,
              lineHeight: 1.45,
              maxWidth: compact ? '100%' : 520,
            }}
          >
            Ofertas exclusivas, regalos de bienvenida y beneficios VIP por tiempo limitado.
          </p>
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)' }}>
            <Ticket size={14} color="#fff" />
            <span style={{ fontSize: compact ? 11 : 13, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>Cupón: YAXSELLDEMO</span>
          </div>
        </div>

        {!compact && (
          <motion.span
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.98 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 22px',
              borderRadius: 16,
              background: '#fff',
              color: PINK,
              fontWeight: 800,
              fontSize: 13,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              flexShrink: 0,
            }}
          >
            Ver ofertas <ArrowRight size={18} />
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} style={{ display: 'block', textDecoration: 'none', marginBottom: compact ? 14 : 24 }}>
        {inner}
      </Link>
    );
  }

  return <motion.div style={{ marginBottom: compact ? 14 : 24 }}>{inner}</motion.div>;
}
