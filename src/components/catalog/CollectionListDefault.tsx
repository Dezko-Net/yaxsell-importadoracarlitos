'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from '@/components/StoreImage';
import { Category } from '@/types';

const FF = '"DM Sans","Proxima Nova",-apple-system,BlinkMacSystemFont,sans-serif';

export default function CollectionList1() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/public-data/catalog');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories as Category[]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="pk-page" style={{ fontFamily: FF, minHeight: '100vh', background: '#f8f9fa' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 42, fontWeight: 900, color: '#111827', margin: '0 0 16px', letterSpacing: '-0.03em' }}>
            Nuestras Colecciones
          </h1>
          <p style={{ fontSize: 16, color: '#6b7280', maxWidth: 600, margin: '0 auto' }}>
            Explora todas nuestras categorías y encuentra exactamente lo que estás buscando.
          </p>
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ height: 220, borderRadius: 24, background: '#e5e7eb', animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
            {categories.map(c => (
              <Link 
                key={c.$id} 
                href={`/collections/all?categoria=${c.$id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#fff',
                  borderRadius: 24,
                  overflow: 'hidden',
                  textDecoration: 'none',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 10px 30px rgba(102,126,234,0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(102,126,234,0.2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(102,126,234,0.1)';
                }}
              >
                <div style={{ position: 'relative', aspectRatio: '4/3', background: 'linear-gradient(135deg, #f8f9fa, #e5e7eb)' }}>
                  {c.iconUrl ? (
                    <Image src={c.iconUrl} alt={c.name} fill style={{ objectFit: 'contain', padding: 30 }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 64, color: '#c7d2fe' }}>
                      {c.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div style={{ padding: '20px 24px', background: '#fff' }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>{c.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: '#667eea', fontSize: 14, fontWeight: 700 }}>
                    Ver productos <span style={{ transition: 'transform 0.2s' }}>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
