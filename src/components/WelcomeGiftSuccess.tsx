'use client';

import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

type Props = {
  percent: number;
  couponCode?: string | null;
  onCopy?: () => void;
  copied?: boolean;
};

export default function WelcomeGiftSuccess({ percent, couponCode, onCopy, copied }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      style={{ textAlign: 'center', padding: '8px 4px 4px' }}
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.05 }}
        style={{
          width: 88,
          height: 88,
          margin: '0 auto 20px',
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #fdf2f8, #fce7f3, #fbcfe8)',
          border: '3px solid #f5a8cf',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(227,150,191,0.25), inset 0 2px 0 rgba(255,255,255,0.9)',
        }}
      >
        <CheckCircle2 size={44} color="#e396bf" strokeWidth={2} />
      </motion.div>

      <motion.span
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          borderRadius: 999,
          background: 'linear-gradient(135deg, #fdf2f8, #fce7f3)',
          border: '1px solid #f5a8cf',
          fontSize: 10,
          fontWeight: 800,
          color: '#be185d',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginBottom: 12,
        }}
      >
        <Sparkles size={12} /> ¡Regalo activado!
      </motion.span>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          margin: '0 0 8px',
          fontSize: 22,
          fontWeight: 900,
          color: '#831843',
          letterSpacing: '-0.03em',
          lineHeight: 1.2,
        }}
      >
        Ahora tienes {percent}% en cualquier producto
      </motion.h3>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.28 }}
        style={{ margin: '0 0 20px', fontSize: 14, color: '#9d174d', lineHeight: 1.5, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}
      >
        Los precios con descuento ya están visibles en toda la tienda. Todo se aplicará automáticamente al comprar.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
      >
        <Link
          href="/productos"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '14px 28px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #f5a8cf, #e396bf, #c0547a)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 800,
            textDecoration: 'none',
            boxShadow: '0 10px 28px rgba(227,150,191,0.35)',
          }}
        >
          <ShoppingBag size={18} /> Ver productos con descuento
        </Link>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        style={{ margin: '18px 0 0', fontSize: 12, color: '#c4b5fd', fontWeight: 600 }}
      >
        Yaxsell — gracias por unirte
      </motion.p>
    </motion.div>
  );
}
