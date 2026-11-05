'use client';

import { useState, useEffect } from 'react';
import Image from '@/components/StoreImage';
import Link from 'next/link';
import { ArrowLeft, X, Plus, ShoppingCart, Search } from 'lucide-react';
import { formatPrice } from '@/lib/db';
import { Product } from '@/types';
import { useCart } from '@/context/CartContext';

const FF = '"Proxima Nova",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';
const MAX_COMPARE = 3;

export default function CompararPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [loading, setLoading] = useState(false);
  const { addItem } = useCart();

  useEffect(() => {
    // Load from URL params
    const params = new URLSearchParams(window.location.search);
    const ids = params.get('ids')?.split(',').filter(Boolean) || [];
    if (ids.length > 0) loadProducts(ids);
  }, []);

  async function loadProducts(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const response = await fetch(`/api/public-data/products?ids=${encodeURIComponent(ids.slice(0, MAX_COMPARE).join(','))}`);
      if (!response.ok) throw new Error(`No se pudieron cargar los productos (${response.status})`);
      const data = await response.json();
      setProducts((data.products || []) as Product[]);
    } catch (e) { console.error(e); }
  }

  async function openPicker() {
    setShowPicker(true);
    if (allProducts.length > 0) return;
    setLoading(true);
    try {
      const response = await fetch('/api/public-data/products?limit=100');
      if (!response.ok) throw new Error(`No se pudieron cargar los productos (${response.status})`);
      const data = await response.json();
      setAllProducts((data.products || []).filter((p: Product) => p.ISACTIVE !== false));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function addProduct(p: Product) {
    if (products.find(x => x.$id === p.$id)) return;
    if (products.length >= MAX_COMPARE) return;
    const next = [...products, p];
    setProducts(next);
    updateUrl(next);
    setShowPicker(false);
    setSearchQ('');
  }

  function removeProduct(id: string) {
    const next = products.filter(p => p.$id !== id);
    setProducts(next);
    updateUrl(next);
  }

  function updateUrl(prods: Product[]) {
    const ids = prods.map(p => p.$id).join(',');
    window.history.replaceState(null, '', ids ? `/comparar?ids=${ids}` : '/comparar');
  }

  const filteredPicker = allProducts.filter(p => {
    if (products.find(x => x.$id === p.$id)) return false;
    if (!searchQ) return true;
    return p.NAME.toLowerCase().includes(searchQ.toLowerCase());
  });

  const specs = [
    { label: 'Precio', render: (p: Product) => formatPrice(p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE) },
    { label: 'Precio original', render: (p: Product) => formatPrice(p.PRICE) },
    { label: 'Descuento', render: (p: Product) => {
      if (!p.CURRENTPRICE || p.CURRENTPRICE >= p.PRICE) return '—';
      return `-${Math.round(((p.PRICE - p.CURRENTPRICE) / p.PRICE) * 100)}%`;
    }},
    { label: 'Stock', render: (p: Product) => p.STOCK != null ? (p.STOCK > 0 ? `${p.STOCK} unidades` : 'Sin stock') : '—' },
    { label: 'Vendidos', render: (p: Product) => p.SOLDQUANTITY ? `${p.SOLDQUANTITY}+` : '—' },
    { label: 'Rating', render: (p: Product) => p.RATING ? `⭐ ${p.RATING.toFixed(1)}` : '—' },
    { label: 'Precio mayorista', render: (p: Product) => p.WHOLESALEPRICE ? `${formatPrice(p.WHOLESALEPRICE)} (mín ${p.WHOLESALEMINQUANTITY})` : '—' },
  ];

  const card: React.CSSProperties = { background: '#fff', borderRadius: 4, fontFamily: FF };

  return (
    <div style={{ background: '#ebebeb', minHeight: '100vh', padding: '20px 5%', fontFamily: FF }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Link href="/productos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#3483fa', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
          <ArrowLeft size={16} /> Volver a productos
        </Link>

        <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 700, color: '#333' }}>Comparar productos</h1>

        {products.length === 0 ? (
          <div style={{ ...card, padding: '60px 20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, color: '#666' }}>Selecciona hasta {MAX_COMPARE} productos para comparar</p>
            <button onClick={openPicker}
              style={{ padding: '12px 24px', background: '#3483fa', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Plus size={18} /> Agregar producto
            </button>
          </div>
        ) : (
          <>
            {/* Product headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${products.length}, 1fr)${products.length < MAX_COMPARE ? ' 120px' : ''}`, gap: 0 }}>
              <div />
              {products.map(p => {
                const price = p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE;
                return (
                  <div key={p.$id} style={{ ...card, padding: 16, textAlign: 'center', position: 'relative', margin: '0 4px' }}>
                    <button onClick={() => removeProduct(p.$id)}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>
                      <X size={16} />
                    </button>
                    <div style={{ width: 120, height: 120, margin: '0 auto 10px', position: 'relative', background: '#f9f9f9', borderRadius: 4 }}>
                      {p.IMAGEURL ? <Image src={p.IMAGEURL} alt={p.NAME} fill style={{ objectFit: 'contain', padding: 8 }} sizes="120px" /> : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>📦</span>}
                    </div>
                    <Link prefetch={false} href={`/productos/${p.$id}`} style={{ fontSize: 13, color: '#333', fontWeight: 600, textDecoration: 'none', display: 'block', marginBottom: 6, lineHeight: 1.3 }}>{p.NAME}</Link>
                    <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 300, color: '#333' }}>{formatPrice(price)}</p>
                    <button onClick={() => addItem(p)} disabled={(p.STOCK ?? 0) === 0}
                      style={{ width: '100%', padding: '8px 0', background: '#3483fa', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (p.STOCK ?? 0) === 0 ? 0.4 : 1 }}>
                      <ShoppingCart size={14} /> Agregar
                    </button>
                  </div>
                );
              })}
              {products.length < MAX_COMPARE && (
                <div onClick={openPicker}
                  style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 4px', cursor: 'pointer', border: '2px dashed #ddd', minHeight: 200 }}>
                  <Plus size={28} color="#ccc" />
                  <span style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Agregar</span>
                </div>
              )}
            </div>

            {/* Specs table */}
            <div style={{ ...card, marginTop: 8, overflow: 'hidden' }}>
              {specs.map((spec, i) => (
                <div key={spec.label} style={{ display: 'grid', gridTemplateColumns: `180px repeat(${products.length}, 1fr)`, background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                  <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#666', borderRight: '1px solid #f0f0f0' }}>{spec.label}</div>
                  {products.map(p => {
                    const val = spec.render(p);
                    const isBest = products.length > 1 && spec.label === 'Precio' && p.PRICE === Math.min(...products.map(x => x.CURRENTPRICE && x.CURRENTPRICE > 0 ? x.CURRENTPRICE : x.PRICE));
                    return (
                      <div key={p.$id} style={{ padding: '10px 16px', fontSize: 14, color: isBest ? '#00a650' : '#333', fontWeight: isBest ? 700 : 400, borderRight: '1px solid #f0f0f0' }}>
                        {val}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Product picker modal */}
      {showPicker && (
        <div onClick={() => { setShowPicker(false); setSearchQ(''); }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'auto', fontFamily: FF }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={16} color="#999" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar producto..."
                autoFocus style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#333' }} />
              <button onClick={() => { setShowPicker(false); setSearchQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}><X size={16} /></button>
            </div>
            {loading ? (
              <p style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>Cargando...</p>
            ) : (
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {filteredPicker.slice(0, 20).map(p => (
                  <div key={p.$id} onClick={() => addProduct(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f8f8f8', transition: 'background .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ width: 40, height: 40, borderRadius: 4, background: '#f9f9f9', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                      {p.IMAGEURL ? <img src={p.IMAGEURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 20 }}>📦</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.NAME}</p>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#333' }}>{formatPrice(p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE)}</p>
                    </div>
                    <Plus size={16} color="#3483fa" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
