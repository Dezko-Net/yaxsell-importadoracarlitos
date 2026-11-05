'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#3b82f6';

interface Props {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}

export default function CuentaPageShell({
  title,
  subtitle,
  backHref = '/cuenta',
  children,
  headerRight,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ minHeight: '100vh', fontFamily: FF, background: 'linear-gradient(180deg, #eff6ff 0%, #fafafa 220px)' }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #dbeafe',
          padding: '14px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 720, margin: '0 auto' }}>
          <Link
            href={backHref}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: '#eff6ff',
              border: '1px solid #dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={20} color={PINK} strokeWidth={2.5} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111827', letterSpacing: '-0.02em' }}>{title}</h1>
            {subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{subtitle}</p>
            )}
          </div>
          {headerRight}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 48px' }}>
        {children}
      </div>
    </motion.div>
  );
}
