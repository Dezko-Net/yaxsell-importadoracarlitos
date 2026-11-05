'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, Minus, Plus } from 'lucide-react';
import type { CartItem } from '@/types';
import { formatPrice } from '@/lib/db';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { useCartItemPrice } from '@/hooks/useCartItemPrice';

const BLUE = '#2563eb';

type Props = {
  item: CartItem;
  onUpdateQty: (id: string, qty: number, isPack?: boolean) => void;
  onRemove: (id: string) => void;
};

export default function CartLineRow({ item, onUpdateQty, onRemove }: Props) {
  const p = item.product;
  const { unitPrice, pricing } = useCartItemPrice(item);
  const lineTotal = unitPrice * item.quantity;
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [incrementMode, setIncrementMode] = useState<'unit' | 'pack'>(item.isPack ? 'pack' : 'unit');

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    setIncrementMode(item.isPack ? 'pack' : 'unit');
  }, [item.isPack]);

  useEffect(() => {
    if (!zoomSrc) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [zoomSrc]);

  return (
    <>
      <div className="cart-item" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f3f4f6', position: 'relative' }}>
        {/* Remove X button — top right */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(p.$id); }}
          style={{
            position: 'absolute', top: 2, right: 2, zIndex: 10,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9ca3af', transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
        >
          <X size={16} />
        </button>

        {/* Image — click to zoom */}
        <div
          onClick={e => { e.stopPropagation(); if (p.IMAGEURL) setZoomSrc(resolveStorageImageUrl(p.IMAGEURL)); }}
          style={{ flexShrink: 0, position: 'relative', width: 60, height: 60, background: '#fafafa', borderRadius: 12, overflow: 'hidden', cursor: p.IMAGEURL ? 'zoom-in' : 'default', border: '1px solid #f0f0f0' }}
        >
          {p.IMAGEURL
            ? <img src={resolveStorageImageUrl(p.IMAGEURL)} alt={p.NAME} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, position: 'absolute', inset: 0 }} />
            : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📦</span>}
        </div>

        {/* Name + Price — NO navigation */}
        <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
          <p style={{ margin: '0 0 2px', fontSize: 13, color: '#1a1a1a', fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {p.NAME}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {pricing.hasDiscount && pricing.originalPrice != null && (
              <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrice(pricing.originalPrice)}</span>
            )}
            <span style={{ fontSize: 15, fontWeight: 700, color: pricing.fromApertura ? BLUE : '#1a1a1a' }}>{formatPrice(unitPrice)}</span>
            {pricing.hasDiscount && !pricing.fromApertura && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '1px 5px', borderRadius: 5 }}>{pricing.discountPercent}% OFF</span>
            )}
            {pricing.fromApertura && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '1px 5px', borderRadius: 5 }}>Promo</span>
            )}
          </div>

          {/* Qty + Line total */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#fafafa', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <button type="button" onClick={() => onUpdateQty(p.$id, Math.max(1, item.quantity - (incrementMode === 'pack' ? (p.PACKQTY || 1) : 1)))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                <Minus size={12} />
              </button>
              <span style={{ minWidth: 24, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#1a1a1a', padding: '0 4px', whiteSpace: 'nowrap' }}>
                {item.quantity}
              </span>
              <button type="button" onClick={() => onUpdateQty(p.$id, item.quantity + (incrementMode === 'pack' ? (p.PACKQTY || 1) : 1))} disabled={item.quantity + (incrementMode === 'pack' ? (p.PACKQTY || 1) : 1) > p.STOCK} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: item.quantity + (incrementMode === 'pack' ? (p.PACKQTY || 1) : 1) > p.STOCK ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.quantity + (incrementMode === 'pack' ? (p.PACKQTY || 1) : 1) > p.STOCK ? '#d1d5db' : '#6b7280' }}>
                <Plus size={12} />
              </button>
            </div>

            {/* 📦 Selector "Por pack" OCULTO (jul 2026): los precios por volumen
                ya aplican solos el nivel mayorista según la cantidad */}
            {false && p.PACKQTY && p.PACKQTY! > 1 && (
              <select
                value={incrementMode}
                onChange={(e) => {
                  const val = e.target.value as 'unit' | 'pack';
                  setIncrementMode(val);
                  if (val === 'pack') {
                    const packSize = p.PACKQTY || 1;
                    const remainder = item.quantity % packSize;
                    const newQty = remainder === 0 ? Math.max(packSize, item.quantity) : Math.ceil(item.quantity / packSize) * packSize;
                    onUpdateQty(p.$id, newQty, true);
                  } else {
                    onUpdateQty(p.$id, item.quantity, false);
                  }
                }}
                style={{
                  fontSize: 11,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid #bfdbfe',
                  background: incrementMode === 'pack' ? '#eff6ff' : '#fff',
                  color: incrementMode === 'pack' ? '#1d4ed8' : '#6b7280',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="unit">Por unidad</option>
                <option value="pack">Por pack ({p.PACKQTY})</option>
              </select>
            )}

            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{formatPrice(lineTotal)}</span>
          </div>
        </div>
      </div>

      {/* Zoom modal — rendered via portal so PageTransition transform doesn't break fixed positioning */}
      {mounted && zoomSrc && createPortal(
        <div
          onClick={() => setZoomSrc(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.85)',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={zoomSrc}
            alt={p.NAME}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, calc(-50% - 40px))',
              maxWidth: '90vw', maxHeight: '70vh', objectFit: 'contain',
              borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: '50%', bottom: '8%',
              transform: 'translateX(-50%)',
              display: 'flex', gap: 10,
              width: '90vw', maxWidth: 400,
            }}
          >
            <Link prefetch={false} href={`/productos/${p.$id}`}
              onClick={() => setZoomSrc(null)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '14px 24px', background: `linear-gradient(135deg, ${BLUE}, #1d4ed8)`,
                color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 700,
                textDecoration: 'none', boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
              }}
            >
              Ver detalle
            </Link>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

