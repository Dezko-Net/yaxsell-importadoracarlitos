'use client';

import { Product } from '@/types';

interface Props {
  product: Product;
  style?: React.CSSProperties;
}

export default function ProductBadges({ product, style }: Props) {
  const badges: { label: string; bg: string; color: string; border?: string }[] = [];

  // Stock status pill (Visible on all products)
  const stock = Number(product.STOCK ?? (product as any).stock ?? 0);
  if (stock <= 0) {
    badges.push({ label: '⛔ Agotado', bg: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' });
  } else if (stock <= 5) {
    badges.push({ label: `⚠️ Últimas ${stock} uds`, bg: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' });
  } else if (stock <= 18) {
    badges.push({ label: `🔥 ¡Apúrate! Quedan ${stock} uds`, bg: '#ffedd5', color: '#ea580c', border: '1px solid #fed7aa' });
  } else {
    badges.push({ label: `🟢 ${stock} disponibles`, bg: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' });
  }

  // New: created in last 7 days
  const createdAt = (product as any).$createdAt;
  if (createdAt) {
    const created = new Date(createdAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - created < sevenDays) {
      badges.push({ label: 'Nuevo', bg: '#fef9c3', color: '#a16207', border: '1px solid #fef08a' });
    }
  }

  // Best seller: sold > 20
  if (product.SOLDQUANTITY && product.SOLDQUANTITY >= 20) {
    badges.push({ label: 'Más vendido', bg: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' });
  }

  // On sale
  if (product.CURRENTPRICE && product.CURRENTPRICE > 0 && product.CURRENTPRICE < product.PRICE) {
    const pct = Math.round(((product.PRICE - product.CURRENTPRICE) / product.PRICE) * 100);
    badges.push({ label: `-${pct}%`, bg: '#fef9c3', color: '#a16207', border: '1px solid #fef08a' });
  }

  if (badges.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, ...style }}>
      {badges.map((b, i) => (
        <span key={i} className="pk-badge" style={{
          fontSize: 10, fontWeight: 800, padding: '4px 9px',
          borderRadius: 999, background: b.bg, color: b.color,
          lineHeight: 1.2, whiteSpace: 'nowrap',
          border: b.border || '1px solid rgba(0,0,0,0.06)',
        }}>
          {b.label}
        </span>
      ))}
    </div>
  );
}
