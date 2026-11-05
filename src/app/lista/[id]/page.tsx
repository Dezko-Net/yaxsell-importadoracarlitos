'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from '@/components/StoreImage';
import { Heart, ShoppingCart, ArrowLeft, Share2 } from 'lucide-react';
import { formatPrice } from '@/lib/firebase-compat';
import { Product } from '@/types';
import { useCart } from '@/context/CartContext';

export default function SharedListPage() {
  const { id } = useParams<{ id: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [listName, setListName] = useState('');
  const { addItem } = useCart();

  useEffect(() => {
    (async () => {
      try {
        // Decode the base64-encoded list
        const decoded = atob(id);
        const data = JSON.parse(decoded) as { name?: string; ids: string[] };
        setListName(data.name || 'Lista de deseos');
        if (data.ids.length === 0) { setLoading(false); return; }

        const response = await fetch(`/api/public-data/products?ids=${encodeURIComponent(data.ids.slice(0, 20).join(','))}`);
        if (!response.ok) throw new Error(`No se pudieron cargar los productos (${response.status})`);
        const result = await response.json();
        // Maintain order
        const map = new Map((result.products || []).map((d: Product) => [d.$id, d]));
        setProducts(data.ids.map(pid => map.get(pid)).filter(Boolean) as Product[]);
      } catch (e) {
        console.error('Invalid list link:', e);
        setListName('Lista no válida');
      }
      finally { setLoading(false); }
    })();
  }, [id]);

  return (
    <div style={{ background: '#ebebeb', minHeight: '100vh', padding: '24px 5%', fontFamily: '"Proxima Nova",-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link href="/productos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#3483fa', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
          <ArrowLeft size={16} /> Ir a la tienda
        </Link>

        <div style={{ background: '#fff', borderRadius: 8, padding: '28px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Heart size={22} color="#e53935" fill="#e53935" />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#333' }}>{listName}</h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#888' }}>{products.length} producto{products.length !== 1 ? 's' : ''}</p>
        </div>

        {loading ? (
          <div style={{ background: '#fff', borderRadius: 8, padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ color: '#999' }}>Cargando lista...</p>
          </div>
        ) : products.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 8, padding: '40px 20px', textAlign: 'center' }}>
            <Heart size={40} color="#ddd" style={{ margin: '0 auto 10px' }} />
            <p style={{ color: '#999', fontSize: 15 }}>Esta lista está vacía</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.map(p => {
              const price = p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE;
              const hasDisc = !!(p.CURRENTPRICE && p.CURRENTPRICE < p.PRICE);
              return (
                <div key={p.$id} style={{ background: '#fff', borderRadius: 8, display: 'flex', gap: 16, padding: 16, alignItems: 'center' }}>
                  <Link prefetch={false} href={`/productos/${p.$id}`} style={{ flexShrink: 0, position: 'relative', width: 90, height: 90, borderRadius: 6, background: '#f9f9f9', overflow: 'hidden' }}>
                    {p.IMAGEURL ? (
                      <Image src={p.IMAGEURL} alt={p.NAME} fill style={{ objectFit: 'contain', padding: 6 }} sizes="90px" />
                    ) : (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📦</span>
                    )}
                    {hasDisc && (
                      <span style={{ position: 'absolute', top: 4, left: 4, background: '#e53935', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 4px', borderRadius: 3 }}>
                        -{Math.round(((p.PRICE - p.CURRENTPRICE!) / p.PRICE) * 100)}%
                      </span>
                    )}
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link prefetch={false} href={`/productos/${p.$id}`} style={{ textDecoration: 'none' }}>
                      <p style={{ margin: '0 0 4px', fontSize: 14, color: '#333', fontWeight: 500, lineHeight: 1.3 }}>{p.NAME}</p>
                    </Link>
                    {hasDisc && <p style={{ margin: '0 0 2px', fontSize: 13, color: '#999', textDecoration: 'line-through' }}>{formatPrice(p.PRICE)}</p>}
                    <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 300, color: '#333' }}>{formatPrice(price)}</p>
                    <button onClick={() => addItem(p)} disabled={(p.STOCK ?? 0) === 0}
                      style={{ padding: '8px 16px', background: '#3483fa', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (p.STOCK ?? 0) === 0 ? 0.4 : 1 }}>
                      <ShoppingCart size={14} /> {(p.STOCK ?? 0) === 0 ? 'Sin stock' : 'Agregar al carrito'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
