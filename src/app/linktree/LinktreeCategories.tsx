'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, Sparkles, ArrowRight } from 'lucide-react';

interface CategoryItem {
  $id?: string;
  name: string;
  emoji?: string;
  iconUrl?: string;
}

interface SubcategoryItem {
  $id: string;
  name: string;
  categoryId: string;
}

const DEFAULT_REAL_CATEGORIES: CategoryItem[] = [
  { name: 'Cuidado Personal', emoji: '🧴', iconUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=300&q=80' },
  { name: 'Limpieza del Hogar', emoji: '🧹', iconUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=300&q=80' },
  { name: 'Hogar y Cocina', emoji: '🍳', iconUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=300&q=80' },
  { name: 'Electrónica y Gadgets', emoji: '📱', iconUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=80' },
  { name: 'Accesorios', emoji: '🕶️', iconUrl: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=300&q=80' },
  { name: 'Novedades y Ofertas', emoji: '🔥', iconUrl: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=300&q=80' },
  { name: 'Edición Especial', emoji: '⭐', iconUrl: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=300&q=80' },
];

const TikTokSvg = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="#0f1f3d" style={{ filter: 'drop-shadow(1px 1px 0px #00f2fe) drop-shadow(-1px -1px 0px #ff0050)' }}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.38a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.64a6.34 6.34 0 0 0 10.82 4.47 6.29 6.29 0 0 0 1.93-4.52V8.34a8.16 8.16 0 0 0 4.84 1.8V6.69z"/>
  </svg>
);

const TIKTOK_ACCOUNTS = [
  { id: '1', label: 'TikTok 1', url: 'https://www.tiktok.com/@yaxsell', badge: '1' },
  { id: '2', label: 'TikTok 2', url: 'https://www.tiktok.com/@yaxsell2', badge: '2' },
];

export default function LinktreeCategories() {
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_REAL_CATEGORIES);
  const [subcategories, setSubcategories] = useState<SubcategoryItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [catsExpanded, setCatsExpanded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadCatalogCategories() {
      try {
        const res = await fetch('/api/public-data/catalog');
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data?.categories && Array.isArray(data.categories) && data.categories.length > 0) {
          const formatted: CategoryItem[] = data.categories.map((c: any) => ({
            $id: c.$id,
            name: c.name || c.NAME || 'Categoría',
            iconUrl: c.iconUrl || c.ICONURL || c.IMAGEURL || c.IMAGE,
            emoji: (c.name || c.NAME || 'C').charAt(0).toUpperCase(),
          }));
          setCategories(formatted);
        }
        if (isMounted && data?.subcategories && Array.isArray(data.subcategories)) {
          setSubcategories(data.subcategories.map((s: any) => ({
            $id: s.$id,
            name: s.name || s.NAME || 'Subcategoría',
            categoryId: s.categoryId || s.CATEGORYID,
          })));
        }
      } catch (err) {
        console.error('[LinktreeCategories] Error loading catalog categories:', err);
      }
    }
    loadCatalogCategories();
    return () => { isMounted = false; };
  }, []);

  const visibleCount = 3;
  const hiddenCount = Math.max(0, categories.length - visibleCount);

  if (categories.length === 0) return null;

  const subsForCat = (catId: string) => subcategories.filter(s => s.categoryId === catId);

  return (
    <div className="lt-meta" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Categorías Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="lt-meta-label" style={{ cursor: 'pointer', userSelect: 'none', color: '#3b82f6', margin: 0 }} onClick={() => setCatsExpanded(!catsExpanded)}>
          {'🛍️'} Las mejores categorías para ti {catsExpanded ? '▾' : '▸'}
        </h3>
      </div>

      {/* ── Categorías ──────────────── */}
      <div className="lt-meta-col" style={{ flex: 1, minWidth: 0 }}>
        <div className="lt-bubbles" style={{ flexWrap: 'wrap', gap: catsExpanded ? '8px' : '0', alignItems: 'flex-start' }}>
          {categories.map((cat, i) => {
            return (
              <Link
                key={cat.$id || i}
                href={catsExpanded ? `/productos?categoria=${encodeURIComponent(cat.name)}` : '#'}
                className="lt-cat-item"
                title={cat.name}
                onClick={(e) => { if (!catsExpanded) { e.preventDefault(); setCatsExpanded(true); } }}
                style={{
                  marginLeft: !catsExpanded && i > 0 ? '-30px' : '0',
                  transition: 'margin-left 0.4s cubic-bezier(0.34, 1.4, 0.64, 1)',
                  zIndex: categories.length - i,
                  position: 'relative',
                }}
              >
                <div className="lt-bubble">
                  {cat.iconUrl ? (
                    <img src={cat.iconUrl} alt={cat.name} style={{
                      width: '100%', height: '100%',
                      objectFit: 'cover',
                      transform: cat.name.toLowerCase().includes('mascot') ? 'scale(1.6)' : 'scale(1)',
                    }} />
                  ) : (
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{cat.emoji}</span>
                  )}
                </div>
                <span className="lt-cat-name" style={{
                  opacity: catsExpanded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                }}>{cat.name}</span>
              </Link>
            );
          })}

          {/* ── Botón para comprimir (Icono circular) ── */}
          {catsExpanded && (
            <button
              onClick={() => setCatsExpanded(false)}
              title="Comprimir categorías"
              aria-label="Comprimir categorías"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                border: '1px solid #dce8fb',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                color: '#1e3a8a',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.25s ease',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(59,130,246,0.15)',
              }}
            >
              <ChevronDown size={18} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Cortina de subcategorías ── */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: showSubs ? '600px' : '0px',
          opacity: showSubs ? 1 : 0,
          transition: 'max-height 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease, margin-top 0.3s ease',
          marginTop: showSubs ? '4px' : '0px',
        }}
      >
        <div
          style={{
            padding: '14px',
            borderRadius: '16px',
            background: 'linear-gradient(180deg, #f8faff 0%, #eef4ff 100%)',
            border: '1px solid #dce8fb',
          }}
        >
          {categories.map((cat) => {
            const catSubs = cat.$id ? subsForCat(cat.$id) : [];
            if (catSubs.length === 0) return null;
            const isOpen = selectedCat === cat.$id;
            const catEmoji = cat.emoji || '📂';
            return (
              <div key={cat.$id} style={{ marginBottom: '8px' }}>
                <button
                  onClick={() => setSelectedCat(isOpen ? null : cat.$id || null)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    background: isOpen ? 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)' : 'rgba(255,255,255,.6)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isOpen ? '#fff' : '#1e3a8a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    transition: 'all 0.25s ease',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '16px' }}>{catEmoji}</span>
                    <span>{cat.name}</span>
                  </span>
                  <ChevronDown size={14} style={{ transition: 'transform 0.25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                <div
                  style={{
                    overflow: 'hidden',
                    maxHeight: isOpen ? '300px' : '0px',
                    transition: 'max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '8px', paddingLeft: '4px' }}>
                    {catSubs.map((sub) => (
                      <Link
                        key={sub.$id}
                        href={`/productos?categoria=${encodeURIComponent(cat.name)}&subcat=${encodeURIComponent(sub.$id)}`}
                        style={{
                          padding: '5px 10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: '#5b7196',
                          textDecoration: 'none',
                          borderRadius: '999px',
                          background: 'rgba(255,255,255,.7)',
                          border: '1px solid #e2ecfb',
                          transition: 'all 0.2s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.color = '#1e3a8a'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.7)'; e.currentTarget.style.color = '#5b7196'; e.currentTarget.style.borderColor = '#e2ecfb'; }}
                      >
                        <span style={{ fontSize: '13px' }}>{'🔹'}</span>
                        <span>{sub.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
