'use client';

import { useState, useCallback, useRef } from 'react';
import { Search, X, Link2, Check, Trash2, Plus, Loader2 } from 'lucide-react';

interface QuoteProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  image: string;
  stock: number;
}

interface QuoteGroup {
  id: string;
  label: string;
  products: QuoteProduct[];
}

export default function CotizacionPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<QuoteProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [groups, setGroups] = useState<QuoteGroup[]>([]);
  const [currentSelection, setCurrentSelection] = useState<QuoteProduct[]>([]);
  const [discountPct, setDiscountPct] = useState(20);
  const [clientName, setClientName] = useState('');
  const [generatingForm, setGeneratingForm] = useState(false);
  const [formLink, setFormLink] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/public-data/products?search=${encodeURIComponent(term)}&limit=100&includeOutOfStock=true`, { cache: 'no-store' });
      const data = await res.json();
      const products: QuoteProduct[] = (data.products || []).map((p: any) => {
        const features = Array.isArray(p.FEATURES) ? p.FEATURES.join('\n') : p.FEATURES || '';
        const tags = Array.isArray(p.TAGS) ? p.TAGS.join(',') : p.TAGS || '';
        let sku = p.SKU || '';
        if (!sku) {
          const m = features.match(/SKU:\s*(.+)/i);
          if (m) sku = m[1].trim().split('\n')[0];
        }
        if (!sku) {
          const tagParts = tags.split(',').map((t: string) => t.trim());
          const skuTag = tagParts.find((t: string) => /^[A-Z0-9]{4,}$/i.test(t));
          sku = skuTag || String(p.jumpseller_id || p.$id.slice(-6).toUpperCase());
        }
        const imgs = Array.isArray(p.IMAGEURL) ? p.IMAGEURL : (p.IMAGEURL ? [p.IMAGEURL] : []);
        const img = imgs[0] || '';
        const imgResolved = img ? (img.startsWith('http') ? `/api/image?url=${encodeURIComponent(img)}` : img) : '';
        return {
          id: p.$id,
          name: p.NAME,
          sku,
          price: Number(p.CURRENTPRICE || p.PRICE || 0),
          image: imgResolved,
          stock: Number(p.STOCK || 0),
        };
      });
      setResults(products);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearch = (val: string) => {
    setSearchTerm(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(val), 350);
  };

  const toggleCurrentSelection = (p: QuoteProduct) => {
    setCurrentSelection(prev => {
      if (prev.find(x => x.id === p.id)) return prev.filter(x => x.id !== p.id);
      return [...prev, p];
    });
  };

  const isCurrentlySelected = (id: string) => currentSelection.some(p => p.id === id);

  const addGroup = () => {
    if (currentSelection.length === 0 || !searchTerm.trim()) return;
    const newGroup: QuoteGroup = {
      id: `g-${Date.now()}`,
      label: searchTerm.trim(),
      products: currentSelection,
    };
    setGroups(prev => [...prev, newGroup]);
    setCurrentSelection([]);
    setSearchTerm('');
    setResults([]);
  };

  const removeGroup = (id: string) => setGroups(prev => prev.filter(g => g.id !== id));

  const removeFromGroup = (groupId: string, productId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, products: g.products.filter(p => p.id !== productId) };
    }).filter(g => g.products.length > 0));
  };

  const discountedPrice = (price: number) => Math.round(price * (1 - discountPct / 100));
  const totalProducts = groups.reduce((s, g) => s + g.products.length, 0);

  const generateForm = async () => {
    if (groups.length === 0) return;
    setGeneratingForm(true);
    try {
      const allProducts = groups.flatMap(g => g.products.map(p => ({ ...p, group: g.label })));
      const res = await fetch('/api/admin/ia/cotizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: allProducts,
          groups: groups.map(g => ({ label: g.label, productIds: g.products.map(p => p.id) })),
          discountPct,
          clientName,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setFormLink(`${window.location.origin}/cotizacion/${data.id}`);
      }
    } catch {
      alert('Error al generar formulario');
    } finally {
      setGeneratingForm(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '12px', paddingBottom: '80px', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <style>{`@media(min-width:768px){.cot-admin-wrap{padding:20px 28px;padding-bottom:20px}}`}</style>
      <div className="cot-admin-wrap" style={{ maxWidth: 1200, margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Cotización al Mayor</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Busca por cada producto pedido, selecciona las opciones y genera un link para que el cliente elija</p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '2px solid #e2e8f0', borderRadius: 14, padding: '12px 18px' }}>
            <Search className="h-5 w-5" style={{ color: '#94a3b8' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Escribe el producto pedido: limpiador facial, protector solar, sérum..."
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }}
              autoFocus
            />
            {searching && <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#00a884' }} />}
            {searchTerm && !searching && (
              <button onClick={() => { setSearchTerm(''); setResults([]); setCurrentSelection([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="cot-admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          <style>{`@media(min-width:900px){.cot-admin-grid{grid-template-columns:1fr 360px !important;gap:20px !important}}`}</style>
          {/* Left: search results + current selection */}
          <div>
            {/* Search results */}
            {results.length > 0 && (
              <div style={{ marginBottom: 8, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                {results.length} producto{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''} para &quot;{searchTerm}&quot;
              </div>
            )}
            <div className="cot-admin-prod-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16, boxSizing: 'border-box' }}>
            <style>{`@media(min-width:640px){.cot-admin-prod-grid{grid-template-columns:repeat(4,1fr) !important;gap:10px !important}}@media(min-width:900px){.cot-admin-prod-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr)) !important;gap:12px !important}}`}</style>
              {results.map(p => {
                const sel = isCurrentlySelected(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleCurrentSelection(p)}
                    style={{
                      background: '#fff', border: `2px solid ${sel ? '#00a884' : '#e2e8f0'}`, borderRadius: 10,
                      padding: 8, cursor: 'pointer', transition: 'all .15s', position: 'relative',
                      boxShadow: sel ? '0 4px 14px rgba(0,168,132,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
                      overflow: 'hidden',
                    }}
                  >
                    {sel && (
                      <div style={{ position: 'absolute', top: 8, right: 8, background: '#00a884', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check className="h-4 w-4" style={{ color: '#fff' }} />
                      </div>
                    )}
                    {p.image && <img src={p.image} alt={p.name} style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 6, marginBottom: 4 }} />}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', lineHeight: 1.2, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.name}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 4 }}>SKU: {p.sku}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#00a884' }}>${p.price.toLocaleString('es-CL')}</span>
                      <span style={{ fontSize: 9, color: p.stock > 0 ? '#00a884' : '#ef4444', fontWeight: 600 }}>
                        {p.stock > 0 ? `${p.stock} stk` : 'Sin stk'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Current selection bar */}
            {currentSelection.length > 0 && (
              <div style={{ background: '#fff', border: '2px solid #00a884', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {currentSelection.length} seleccionado{currentSelection.length !== 1 ? 's' : ''} para &quot;{searchTerm}&quot;
                  </span>
                  <button
                    onClick={addGroup}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#00a884', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' }}
                  >
                    <Plus className="h-4 w-4" />
                    Agregar categoría
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {currentSelection.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</span>
                      <span style={{ color: '#00a884', fontWeight: 700 }}>${discountedPrice(p.price).toLocaleString('es-CL')}</span>
                      <button onClick={() => toggleCurrentSelection(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, display: 'flex' }}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.length === 0 && !searching && searchTerm && (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
                No se encontraron productos. Intenta con otra palabra.
              </div>
            )}
            {!searchTerm && groups.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
                <Search className="h-12 w-12" style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                Escribe el primer producto pedido para buscar opciones
              </div>
            )}
          </div>

          {/* Right: groups panel */}
          <div className="cot-groups-panel" style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: 14, padding: 14, position: 'static', maxHeight: 'none', overflowY: 'visible' }}>
          <style>{`@media(min-width:900px){.cot-groups-panel{position:sticky !important;top:20px !important;max-height:calc(100vh - 40px) !important;overflow-y:auto !important}}`}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                Categorías ({groups.length})
              </h2>
              {groups.length > 0 && (
                <span style={{ fontSize: 12, color: '#64748b' }}>{totalProducts} productos</span>
              )}
            </div>

            {/* Client name */}
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nombre del cliente (opcional)"
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 12, outline: 'none' }}
            />

            {/* Discount */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Descuento:</span>
              <input
                type="number"
                value={discountPct}
                onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                style={{ width: 60, padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, fontWeight: 700, textAlign: 'center', color: '#00a884', outline: 'none' }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#00a884' }}>%</span>
            </div>

            {/* Groups list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {groups.map((g, gi) => (
                <div key={g.id} style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ background: '#00a884', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{gi + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{g.label}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>({g.products.length})</span>
                    </div>
                    <button onClick={() => removeGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {g.products.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        {p.image && <img src={p.image} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                        <span style={{ flex: 1, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        <span style={{ color: '#00a884', fontWeight: 700 }}>${discountedPrice(p.price).toLocaleString('es-CL')}</span>
                        <button onClick={() => removeFromGroup(g.id, p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0 }}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: '#cbd5e1', fontSize: 13 }}>
                  Busca y selecciona productos para crear categorías
                </div>
              )}
            </div>

            {/* Actions */}
            {groups.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={generateForm}
                  disabled={generatingForm}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#00a884', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  {generatingForm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Generar Link para Cliente
                </button>
                {formLink && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#00a884', marginBottom: 4 }}>¡Link generado!</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input readOnly value={formLink} style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#475569' }} />
                      <button onClick={() => { navigator.clipboard.writeText(formLink); }} style={{ background: '#00a884', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Copiar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
