'use client';

interface Props {
  stock: number;
  soldQuantity?: number;
}

export default function StockIndicator({ stock, soldQuantity = 0 }: Props) {
  if (stock <= 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
        <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>Sin stock disponible</span>
      </div>
    );
  }

  const isCritical = stock <= 5;
  const isApurate = stock > 5 && stock <= 18;
  const isHealthy = stock > 18;

  const barColor = isCritical ? '#dc2626' : isApurate ? '#ea580c' : '#10b981';
  const barPct = isCritical ? Math.max(15, (stock / 5) * 35) : isApurate ? Math.max(40, (stock / 18) * 65) : Math.min(100, 70 + (stock / 100) * 30);

  return (
    <div style={{ padding: '8px 0' }}>
      {isCritical ? (
        <p style={{ margin: '0 0 5px', fontSize: 13, color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>⚠️</span> ¡Solo quedan {stock}! — Últimas unidades en tienda
        </p>
      ) : isApurate ? (
        <p style={{ margin: '0 0 5px', fontSize: 13, color: '#ea580c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🔥</span> ¡Apúrate que se acaban! Quedan {stock} unidades
        </p>
      ) : (
        <p style={{ margin: '0 0 5px', fontSize: 13, color: '#047857', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🟢</span> Stock disponible: {stock} unidades en tienda
        </p>
      )}

      <div style={{ height: 5, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          borderRadius: 999,
          width: `${barPct}%`,
          background: barColor,
          transition: 'width .4s ease',
        }} />
      </div>
      {soldQuantity >= 10 && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
          {soldQuantity}+ unidades vendidas recientemente
        </p>
      )}
    </div>
  );
}
