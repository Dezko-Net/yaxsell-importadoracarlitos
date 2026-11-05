'use client';

import { useEffect, useState } from 'react';
import Image from '@/components/StoreImage';
import Link from 'next/link';
import { X, ShoppingCart } from 'lucide-react';
import { Product } from '@/types';
import { formatPrice } from '@/lib/db';
import { getProductImageUrl } from '@/lib/product-images';
import { useCart } from '@/context/CartContext';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice, isDisableDiscounts } from '@/lib/apertura-promo';
import { getSkuFromFeatures } from '@/lib/product-features';

interface Props {
  product: Product;
  onClose: () => void;
  isPackMode?: boolean;
}

type Phase = 'entering' | 'open' | 'closing';

export default function ProductCardPreview({ product, onClose, isPackMode }: Props) {
  const { addItem } = useCart();
  const { settings: apertura } = useAperturaPromotion();
  const [phase, setPhase] = useState<Phase>('entering');

  useEffect(() => {
    const t = requestAnimationFrame(() => setPhase('open'));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prev;
    };
  }, []);

  const basePricing = resolveProductDisplayPrice(product, apertura);
  const packQty = product.PACKQTY || 0;
  const isPackQtyReached = isPackMode && packQty > 1;
  const pricing = basePricing;
  const price = pricing.displayPrice;
  const stockCount = (product.STOCK !== undefined && product.STOCK !== null) ? Number(product.STOCK) : Number((product as any).stock || 0);
  const outOfStock = stockCount <= 0;
  const isOpen = phase === 'open';
  const isClosing = phase === 'closing';

  function close() {
    if (isClosing) return;
    setPhase('closing');
    setTimeout(onClose, 340);
  }

  function handleBuy() {
    if (outOfStock) return;
    const buyQty = isPackMode && product.PACKQTY ? product.PACKQTY : 1;
    const webPrice = Number((product as any)?.WEBPRICE ?? (product as any)?.web_price ?? 0);
    const packOverride = (webPrice > 0) ? undefined : (isPackQtyReached && !isDisableDiscounts(product) ? (product.WHOLESALEPRICE ?? undefined) : undefined);
    addItem(product, buyQty, undefined, undefined, packOverride, isPackMode);
    close();
  }

  return (
    <div
      className="pk-preview-backdrop"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        background: isOpen ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
        backdropFilter: isOpen ? 'blur(8px)' : 'blur(0px)',
        WebkitBackdropFilter: isOpen ? 'blur(8px)' : 'blur(0px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        transition: 'background 0.32s ease, backdrop-filter 0.32s ease',
        opacity: isClosing ? 0 : 1,
      }}
    >
      <div
        className="pk-preview-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 480, background: '#fff',
          borderRadius: '0 0 22px 22px', overflow: 'hidden',
          marginBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          boxShadow: isOpen ? '0 -16px 48px rgba(0,0,0,0.22)' : '0 -4px 20px rgba(0,0,0,0.08)',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(100%) scale(0.96)',
          opacity: isOpen ? 1 : 0,
          transition: 'transform 0.36s cubic-bezier(0.16,1,0.3,1), opacity 0.28s ease, box-shadow 0.36s ease',
        }}
      >
        <div
          style={{
            display: 'flex', justifyContent: 'center', padding: '10px 0 4px',
            transform: isOpen ? 'scaleX(1)' : 'scaleX(0.4)',
            opacity: isOpen ? 1 : 0,
            transition: 'transform 0.3s ease, opacity 0.25s ease',
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 999, background: '#e5e7eb' }} />
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.95)', color: '#e396bf', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
            transform: isOpen ? 'scale(1) rotate(0deg)' : 'scale(0.8) rotate(-90deg)',
            opacity: isOpen ? 1 : 0,
            transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease',
          }}
        >
          <X size={18} />
        </button>
        <div
          style={{
            position: 'relative', width: '100%', aspectRatio: '1',
            background: 'linear-gradient(135deg,#fdf2f8,#fff)',
            transform: isOpen ? 'scale(1)' : 'scale(1.04)',
            opacity: isOpen ? 1 : 0.85,
            transition: 'transform 0.38s cubic-bezier(0.16,1,0.3,1), opacity 0.32s ease',
          }}
        >
          {getProductImageUrl(product) ? (
            <Image src={getProductImageUrl(product)} alt={product.NAME} fill sizes="(max-width: 768px) 90vw, 500px" referrerPolicy="no-referrer" style={{ objectFit: 'contain' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 64 }}>📦</div>
          )}
        </div>
        <div
          style={{
            padding: '16px 16px 20px',
            transform: isOpen ? 'translateY(0)' : 'translateY(12px)',
            opacity: isOpen ? 1 : 0,
            transition: 'transform 0.34s cubic-bezier(0.16,1,0.3,1) 0.05s, opacity 0.28s ease 0.05s',
          }}
        >
          {(() => {
            const pFeatures = Array.isArray(product.FEATURES) ? product.FEATURES.join('\n') : product.FEATURES;
            const pTags = Array.isArray(product.TAGS) ? product.TAGS.join(',') : product.TAGS;
            const pSku = getSkuFromFeatures(pFeatures, pTags, (product as any).jumpseller_id, product.SKU || (product as any).sku);
            return pSku ? <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, fontWeight: 700 }}>SKU: {pSku}</div> : null;
          })()}
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.35 }}>{product.NAME}</p>
          <div style={{ margin: '0 0 14px', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e396bf' }}>{formatPrice(price)}</p>
            {pricing.hasDiscount && pricing.originalPrice != null && (
              <>
                <p style={{ margin: 0, fontSize: 14, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrice(pricing.originalPrice)}</p>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>-{pricing.discountPercent}% OFF</span>
              </>
            )}
          </div>
          <div style={{ margin: '0 0 12px' }}>
            {outOfStock ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#be123c', background: '#ffe4e6', border: '1px solid #fecdd3', borderRadius: 999, padding: '4px 12px' }}>
                🚫 Sin stock (0 unidades disponibles)
              </span>
            ) : stockCount <= 5 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 999, padding: '4px 12px' }}>
                ⚠️ ¡Últimas <strong>{stockCount} unidades</strong> en tienda!
              </span>
            ) : stockCount <= 18 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#c2410c', background: '#ffedd5', border: '1px solid #fed7aa', borderRadius: 999, padding: '4px 12px' }}>
                🔥 ¡Apúrate que se acaban! Quedan <strong>{stockCount} unidades</strong>
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#065f46', background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '4px 12px' }}>
                🟢 Stock disponible: <strong>{stockCount} unidades</strong>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleBuy}
            disabled={outOfStock}
            style={{
              width: '100%', padding: 14, border: 'none', borderRadius: 14, marginBottom: 10,
              background: outOfStock ? '#f3f4f6' : 'linear-gradient(135deg,#e396bf,#f5a8cf)',
              color: outOfStock ? '#9ca3af' : '#fff', fontSize: 15, fontWeight: 800, cursor: outOfStock ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: outOfStock ? 'none' : '0 6px 20px rgba(227,150,191,0.35)',
            }}
          >
            <ShoppingCart size={18} /> {outOfStock ? 'Sin stock' : 'Comprar ahora'}
          </button>
          <Link prefetch={false} href={`/productos/${product.$id}${isPackMode ? '?mode=paquetes' : ''}`}
            onClick={close}
            style={{
              display: 'block', width: '100%', padding: 13, borderRadius: 14, textAlign: 'center',
              border: '1.5px solid #fce7f3', background: '#fff', color: '#e396bf',
              fontSize: 14, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit',
            }}
          >
            Ir a producto
          </Link>
        </div>
      </div>
    </div>
  );
}
