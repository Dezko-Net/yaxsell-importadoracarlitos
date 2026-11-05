'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from '@/components/StoreImage';
import { Clock } from 'lucide-react';
import { formatPrice } from '@/lib/db';
import { getProductImageUrl } from '@/lib/product-images';
import { Product } from '@/types';

const STORAGE_KEY = 'recently_viewed';
const MAX_ITEMS = 12;

export function trackView(productId: string) {
  try {
    const items: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const filtered = items.filter(id => id !== productId);
    filtered.unshift(productId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
  } catch {}
}

function getRecentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export default function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = getRecentIds().filter(id => id !== excludeId).slice(0, 8);
    if (ids.length === 0) { setLoading(false); return; }

    fetch(`/api/public-data/products?ids=${ids.join(',')}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch recent products');
        return res.json();
      })
      .then(data => {
        if (data && data.products) {
          setProducts(data.products as Product[]);
        }
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [excludeId]);

  if (loading || products.length === 0) return null;

  return (
    <div style={{ margin: '24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Clock size={18} color="#666" />
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>Vistos recientemente</h3>
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
        {products.map(p => {
          const price = p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE;
          const hasDisc = !!(p.CURRENTPRICE && p.CURRENTPRICE < p.PRICE);
          return (
            <Link key={p.$id} href={`/productos/${p.$id}`}
              style={{ flexShrink: 0, width: 160, background: '#fff', borderRadius: 6, overflow: 'hidden', textDecoration: 'none', border: '1px solid #f0f0f0', scrollSnapAlign: 'start', transition: 'box-shadow .2s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ position: 'relative', width: '100%', height: 140, background: '#f9f9f9' }}>
                {p.IMAGEURL ? (
                  <img src={getProductImageUrl(p)} alt={p.NAME} referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: 8, boxSizing: 'border-box' }} />
                ) : (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>📦</span>
                )}
                {hasDisc && (
                  <span style={{ position: 'absolute', top: 6, left: 6, background: '#e53935', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 5px', borderRadius: 3 }}>
                    -{Math.round(((p.PRICE - p.CURRENTPRICE!) / p.PRICE) * 100)}%
                  </span>
                )}
              </div>
              <div style={{ padding: '8px 10px' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatPrice(price)}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.NAME}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
