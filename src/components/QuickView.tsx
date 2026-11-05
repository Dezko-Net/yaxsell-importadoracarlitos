'use client';

import { useState, useEffect } from 'react';
import Image from '@/components/StoreImage';
import Link from 'next/link';
import { X, ShoppingCart, Check, Eye, ChevronLeft, ChevronRight, Star, Truck, Shield, RotateCcw, Heart, Zap } from 'lucide-react';
import { formatPrice } from '@/lib/db';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/hooks/useAuth';
import FavoriteButton from '@/components/FavoriteButton';

interface Props {
  product: Product;
  onClose: () => void;
}

export default function QuickView({ product, onClose }: Props) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const [added, setAdded] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [isClosing, setIsClosing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fallbacks for mock data vs Appwrite models
  const rawImages = (product as any).images || [product.IMAGEURL, product.IMAGEURL2, product.IMAGEURL3, product.IMAGEURL4, product.IMAGEURL5].filter(Boolean);
  const images = rawImages.map((v: string) => resolveStorageImageUrl(v)) as string[];
  const productName = product.NAME || (product as any).name || 'Producto';
  const basePrice = product.PRICE ?? (product as any).price ?? 0;
  const currentPrice = product.CURRENTPRICE ?? (product as any).currentPrice ?? basePrice;
  const hasDisc = currentPrice < basePrice;
  const discPct = hasDisc ? Math.round(((basePrice - currentPrice) / basePrice) * 100) : 0;
  const hasWholesale = ((product.WHOLESALEPRICE ?? 0) > 0 && (product.WHOLESALEMINQUANTITY ?? 0) > 0);
  const isWholesaleUser = user?.isWholesale || false;
  const isWholesaleQty = hasWholesale && isWholesaleUser && qty >= (product.WHOLESALEMINQUANTITY || 0);
  const effectivePrice = isWholesaleQty ? product.WHOLESALEPRICE! : currentPrice;
  const stock = product.STOCK ?? (product as any).stock ?? 50;
  const rating = product.RATING ?? (product as any).rating ?? 0;
  const numReviews = product.NUMREVIEWS ?? (product as any).numReviews ?? 0;
  const stockPct = Math.min(100, (stock / 50) * 100);
  const stockColor = stock > 10 ? '#00a650' : stock > 5 ? '#f57c00' : stock > 0 ? '#e53935' : '#bbb';

  function handleAdd() {
    addItem(product, qty, undefined, undefined, isWholesaleQty ? product.WHOLESALEPRICE : undefined);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function handleClose() {
    setIsClosing(true);
    setTimeout(onClose, 250);
  }

  return (
    <>
      <style>{`
        .qv-thumb { border: 2px solid transparent; transition: border-color .2s, transform .2s; cursor: pointer; }
        .qv-thumb:hover { transform: scale(1.08); }
        .qv-thumb-active { border-color: #3483fa !important; }
        .qv-add-btn { position: relative; overflow: hidden; }
        .qv-add-btn::after { content:''; position:absolute; top:0; left:-100%; width:60%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent); transform:skewX(-20deg); }
        .qv-add-btn:hover::after { animation: qvShimmer 0.5s ease forwards; }
        @keyframes qvShimmer { 0%{left:-100%} 100%{left:160%} }
        .qv-feature { display:flex; align-items:center; gap:6px; font-size:11px; color:#666; }
        .qv-feature svg { flex-shrink:0; }
      `}</style>
      <div onClick={handleClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: (mounted && !isClosing) ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
        backdropFilter: (mounted && !isClosing) ? 'blur(6px)' : 'blur(0px)',
        WebkitBackdropFilter: (mounted && !isClosing) ? 'blur(6px)' : 'blur(0px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        transition: 'background .25s, backdrop-filter .25s',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 1100, maxHeight: '92vh',
          overflow: 'hidden', position: 'relative',
          boxShadow: '0 25px 60px rgba(0,0,0,0.2), 0 8px 20px rgba(0,0,0,0.1)',
          opacity: (mounted && !isClosing) ? 1 : 0,
          transform: (mounted && !isClosing) ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
          transition: 'opacity 0.25s, transform 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}>
          {/* Close button */}
          <button onClick={handleClose} style={{
            position: 'absolute', top: 14, right: 14, zIndex: 10, width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .2s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'rotate(90deg)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.06)'; (e.currentTarget as HTMLElement).style.transform = ''; }}
          >
            <X size={16} color="#333" strokeWidth={2.5} />
          </button>

          <div style={{ display: 'flex', maxHeight: '92vh' }}>
            {/* ── LEFT: Image Gallery ── */}
            <div style={{ width: 520, flexShrink: 0, background: '#f8f8f8', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {/* Main image */}
              <div style={{ position: 'relative', flex: 1, minHeight: 360 }}>
                {images[imgIdx] ? (
                  <img src={images[imgIdx]} alt={productName} referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: 20, boxSizing: 'border-box' }} />
                ) : (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72 }}>📦</span>
                )}
                {images.length > 1 && (
                  <>
                    <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <ChevronLeft size={15} />
                    </button>
                    <button onClick={() => setImgIdx(i => (i + 1) % images.length)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <ChevronRight size={15} />
                    </button>
                  </>
                )}
                {/* Badges */}
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hasDisc && <span style={{ background: 'linear-gradient(135deg, #ff416c, #ff4b2b)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, boxShadow: '0 2px 8px rgba(255,65,108,0.3)' }}>-{discPct}%</span>}
                  {hasWholesale && <span style={{ background: 'linear-gradient(135deg,#ffe082,#ffa000)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20 }}>MAYORISTA</span>}
                </div>
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <FavoriteButton productId={product.$id} size={20} />
                </div>
              </div>
              {/* Thumbnails */}
              {images.length > 1 && (
                <div style={{ display: 'flex', gap: 6, padding: '10px 16px 14px', justifyContent: 'center', background: '#f0f0f0' }}>
                  {images.map((img, i) => (
                    <div key={i} className={`qv-thumb ${i === imgIdx ? 'qv-thumb-active' : ''}`}
                      onClick={() => setImgIdx(i)}
                      style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#fff' }}>
                      <img src={img} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: 4, boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── RIGHT: Product Info ── */}
            <div style={{ flex: 1, padding: '24px 28px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Name */}
              <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3, paddingRight: 30 }}>{productName}</h2>

              {/* Rating */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                {[1,2,3,4,5].map(i => <Star key={i} size={14} fill={i <= Math.round(rating) ? '#f6a500' : '#e8e8e8'} stroke={i <= Math.round(rating) ? '#e69500' : '#ddd'} strokeWidth={1.5} />)}
                <span style={{ fontSize: 12, color: '#888', marginLeft: 2 }}>{rating > 0 ? rating.toFixed(1) : '—'}{numReviews > 0 ? ` (${numReviews} reseñas)` : ''}</span>
              </div>

              {/* Price block */}
              <div style={{ background: '#f8f9fa', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: hasDisc ? '#e53935' : '#1a1a1a', letterSpacing: '-1px', lineHeight: 1 }}>{formatPrice(currentPrice)}</span>
                  {hasDisc && <span style={{ fontSize: 15, color: '#b0b0b0', textDecoration: 'line-through' }}>{formatPrice(basePrice)}</span>}
                  {hasDisc && <span style={{ fontSize: 12, fontWeight: 700, color: '#00a650', background: '#e8f5e9', padding: '2px 8px', borderRadius: 10 }}>{discPct}% OFF</span>}
                </div>
                {hasWholesale && currentPrice * qty >= 300000 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#f57c00', fontWeight: 600 }}>
                    <Zap size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Precio mayorista: {formatPrice(product.WHOLESALEPRICE!)} (pedidos +$300.000)
                  </div>
                )}
              </div>

              {/* Stock bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: stockColor }}>
                    {stock > 10 ? 'Stock disponible' : stock > 5 ? 'Stock limitado' : stock > 0 ? `¡Solo quedan ${stock}!` : 'Sin stock'}
                  </span>
                  <span style={{ fontSize: 10, color: '#aaa' }}>{stock} unidades</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: '#eee', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stockPct}%`, background: `linear-gradient(90deg, ${stockColor}, ${stockColor}cc)`, borderRadius: 2, transition: 'width .5s ease' }} />
                </div>
              </div>

              {/* Description */}
              {(product.DESCRIPTION || (product as any).description) && (
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#555', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {product.DESCRIPTION || (product as any).description}
                </p>
              )}

              {/* Features */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 16, padding: '10px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                <div className="qv-feature"><Truck size={13} color="#3483fa" /><span>Envío rápido</span></div>
                <div className="qv-feature"><Shield size={13} color="#00a650" /><span>Compra segura</span></div>
                <div className="qv-feature"><Truck size={13} color="#f57c00" /><span>Despacho en 24h</span></div>
                <div className="qv-feature"><Heart size={13} color="#e53935" /><span>Garantía incluida</span></div>
              </div>

              {/* Quantity + Actions */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stock > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Cantidad:</span>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
                      <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 32, height: 32, border: 'none', background: '#f9f9f9', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#555' }}>−</button>
                      <span style={{ width: 36, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#333' }}>{qty}</span>
                      <button onClick={() => setQty(q => Math.min(stock, q + 1))} style={{ width: 32, height: 32, border: 'none', background: '#f9f9f9', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#555' }}>+</button>
                    </div>
                    <span style={{ fontSize: 11, color: '#aaa' }}>Máx. {stock}</span>
                  </div>
                )}
                {stock > 0 && (
                  <button className="qv-add-btn" onClick={handleAdd}
                    style={{ width: '100%', padding: '13px 0', background: added ? 'linear-gradient(135deg, #00a650, #00c853)' : 'linear-gradient(135deg, #3483fa, #2968c8)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s', boxShadow: '0 4px 14px rgba(52,131,250,0.25)' }}>
                    {added ? <><Check size={17} strokeWidth={3} /> ¡Agregado!</> : <><ShoppingCart size={17} /> Agregar al carrito — {formatPrice(currentPrice * qty)}</>}
                  </button>
                )}
                <Link prefetch={false} href={`/productos/${product.$id}`} onClick={handleClose}
                  style={{ width: '100%', padding: '11px 0', background: '#fff', color: '#3483fa', border: '1.5px solid #3483fa', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3483fa'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.color = '#3483fa'; }}
                >
                  <Eye size={14} /> Ver detalle completo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
