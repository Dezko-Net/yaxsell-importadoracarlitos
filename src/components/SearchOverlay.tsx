'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Search, Clock, X, TrendingUp, ArrowRight } from 'lucide-react';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, formatPrice } from '@/lib/db';
import { normalizeProductImages, getProductImageUrl } from '@/lib/product-images';
import { Query } from '@/lib/db';
import { Product } from '@/types';
import { getSkuFromFeatures } from '@/lib/product-features';

const MAX_HISTORY = 8;
const STORAGE_KEY = 'search_history';

function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
}
function addToHistory(term: string) {
  const h = getHistory().filter(t => t.toLowerCase() !== term.toLowerCase());
  h.unshift(term);
  saveHistory(h);
}

const TRENDING = ['Ofertas del día', 'Envío gratis', 'Lo más vendido', 'Nuevo'];

interface Props {
  onClose: () => void;
  initialQuery?: string;
}

export default function SearchOverlay({ onClose, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [history, setHistory] = useState<string[]>([]);
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setHistory(getHistory());
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/public-data/products?search=${encodeURIComponent(q.trim())}&limit=6`);
      if (res.ok) {
        const data = await res.json();
        const prods = (data.products || []) as Product[];
        setResults(prods.map(p => normalizeProductImages(p)));
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    // Removed debounce search here
  }

  function handleSearchSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    addToHistory(query.trim());
    searchProducts(query.trim());
  }

  function goSearch(term?: string) {
    const t = (term || query).trim();
    if (!t) return;
    addToHistory(t);
    window.location.assign(`/productos?q=${encodeURIComponent(t)}`);
    onClose();
  }

  function clearHistory() {
    saveHistory([]);
    setHistory([]);
  }

  function removeHistoryItem(item: string) {
    const h = getHistory().filter(t => t !== item);
    saveHistory(h);
    setHistory(h);
  }

  const showSuggestions = !query.trim() || query.length < 2;
  const showFallback = !loading && results.length === 0 && query.length >= 2;

  // Cargar "Más vendidos" como fallback si no hay resultados
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  useEffect(() => {
    if (showFallback && bestSellers.length === 0) {
      fetch('/api/public-data/products?limit=6&sortMode=popular')
        .then(r => r.json())
        .then(data => setBestSellers(data.products || []))
        .catch(() => {});
    }
  }, [showFallback]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#fff', maxWidth: 640, margin: '0 auto', maxHeight: '85vh', overflow: 'auto', borderRadius: 16, marginTop: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #fce7f3', background: 'linear-gradient(135deg, #fdf2f8, #fdf2f8)' }}>
          <Search size={18} color="#e396bf" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="Buscar productos, marcas y más..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#333', padding: '8px 0', background: 'transparent', fontFamily: "'DM Sans', system-ui, sans-serif" }}
          />
          {query && <button type="button" onClick={() => { setQuery(''); setResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={16} color="#e396bf" /></button>}
          <button type="submit" style={{ background: '#e396bf', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Buscar</button>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#e396bf', fontWeight: 600, padding: '4px 8px' }}>Cerrar</button>
        </form>

        {showSuggestions ? (
          <div style={{ padding: '12px 16px', background: '#fff' }}>
            {/* Recent searches */}
            {history.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>Búsquedas recientes</p>
                  <button onClick={clearHistory} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#e396bf' }}>Limpiar</button>
                </div>
                {history.map(h => (
                  <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f8f8f8' }}>
                    <Clock size={14} color="#ccc" />
                    <button onClick={() => goSearch(h)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14, color: '#333', padding: 0 }}>{h}</button>
                    <button onClick={() => removeHistoryItem(h)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><X size={12} color="#ccc" /></button>
                  </div>
                ))}
              </div>
            )}
            {/* Trending */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase' }}>Tendencias</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TRENDING.map(t => (
                  <button key={t} onClick={() => goSearch(t)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#fdf2f8', border: '1px solid rgba(227,150,191,0.15)', borderRadius: 20, cursor: 'pointer', fontSize: 13, color: '#be185d' }}>
                    <TrendingUp size={12} color="#e396bf" /> {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 0', background: '#fff' }}>
            {loading && <p style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: '#999' }}>Buscando...</p>}
            {!loading && results.length === 0 && query.length >= 2 && (
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>No se encontraron resultados exactos.</p>
                {bestSellers.length > 0 && (
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#e396bf', textTransform: 'uppercase' }}>Más vendidos</p>
                    {bestSellers.map(p => {
                      const price = p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE;
                      return (
                        <Link key={`fallback-${p.$id}`} href={`/productos/${p.$id}`} onClick={() => { addToHistory(query); onClose(); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #f8f8f8', transition: 'background .15s' }}>
                          {getProductImageUrl(p) && (
                            <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#f5f5f5' }}>
                              <img src={getProductImageUrl(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 14, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.NAME}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#e396bf' }}>{formatPrice(price)}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {results.map(p => {
              const price = p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE;
              return (
                <Link key={p.$id} href={`/productos/${p.$id}`} onClick={() => { addToHistory(query); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', textDecoration: 'none', borderBottom: '1px solid #f8f8f8', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fdf2f8')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {getProductImageUrl(p) && (
                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#f5f5f5' }}>
                      <img src={getProductImageUrl(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.NAME}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#e396bf' }}>{formatPrice(price)}</p>
                  </div>
                </Link>
              );
            })}
            {results.length > 0 && (
              <button onClick={() => goSearch()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#e396bf', fontWeight: 600 }}>
                Ver todos los resultados <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
