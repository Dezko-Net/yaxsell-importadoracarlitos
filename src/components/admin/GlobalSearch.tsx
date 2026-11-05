'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { listAllUserProfiles } from '@/lib/users-db';
import { Search, X, Package, ShoppingCart, Users } from 'lucide-react';
import Link from 'next/link';

interface Result {
  id: string;
  label: string;
  sub?: string;
  href: string;
  type: 'order' | 'product' | 'user';
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [placeholder, setPlaceholder] = useState('Buscar');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termIdxRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TERMS = ['pedidos', 'productos', 'clientes', 'variantes', 'facturas'];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    if (open) return;
    let charIdx = 0;
    let deleting = false;
    let current = TERMS[termIdxRef.current];
    const tick = () => {
      if (!deleting) {
        setPlaceholder('Buscar ' + current.slice(0, charIdx));
        if (charIdx < current.length) { charIdx++; tickRef.current = setTimeout(tick, 65); }
        else { tickRef.current = setTimeout(() => { deleting = true; tick(); }, 1800); }
      } else {
        if (charIdx > 0) { charIdx--; setPlaceholder('Buscar ' + current.slice(0, charIdx)); tickRef.current = setTimeout(tick, 38); }
        else {
          termIdxRef.current = (termIdxRef.current + 1) % TERMS.length;
          current = TERMS[termIdxRef.current];
          deleting = false;
          tickRef.current = setTimeout(tick, 400);
        }
      }
    };
    tickRef.current = setTimeout(tick, 1200);
    return () => { if (tickRef.current) clearTimeout(tickRef.current); };
  }, [open]);

  const search = useCallback(async (q: string) => {
    const clean = q.trim();
    if (clean.length < 2) { setResults([]); return; }
    setIsSearching(true);
    try {
      const qLower = clean.toLowerCase();
      const [ordersR, productsR, usersR] = await Promise.allSettled([
        fetch(`/api/admin/orders/search?q=${encodeURIComponent(clean)}`).then(r => r.ok ? r.json() : { documents: [] }),
        fetch(`/api/public-data/products?search=${encodeURIComponent(clean)}&limit=5&includeOutOfStock=true&includeVendorProducts=true`).then(r => r.ok ? r.json() : { products: [] }),
        listAllUserProfiles(200),
      ]);

      const out: Result[] = [];
      if (ordersR.status === 'fulfilled') {
        const orderDocs = Array.isArray(ordersR.value?.documents) ? ordersR.value.documents.slice(0, 5) : [];
        orderDocs.forEach((o: any) => out.push({
          id: o.$id, type: 'order',
          label: o.ORDERCODE || `Pedido ${String(o.$id || '').slice(0, 8)}`,
          sub: o.CUSTOMERNAME,
          href: `/admin/orders/${o.$id}`,
        }));
      }
      if (productsR.status === 'fulfilled') {
        const prodDocs = Array.isArray(productsR.value?.products) ? productsR.value.products.slice(0, 5) : [];
        prodDocs.forEach((p: any) => out.push({
          id: p.$id, type: 'product',
          label: p.NAME,
          sub: p.SKU || p.sku || (p.CATEGORYID ? undefined : 'Sin categoría'),
          href: `/admin/products?search=${encodeURIComponent(p.SKU || p.NAME || '')}`,
        }));
      }
      if (usersR.status === 'fulfilled') {
        const matchedUsers = (usersR.value || [])
          .filter(u =>
            (u.name || '').toLowerCase().includes(qLower) ||
            (u.email || '').toLowerCase().includes(qLower) ||
            (u.phone || '').toLowerCase().includes(qLower)
          )
          .slice(0, 5);
        matchedUsers.forEach((u: any) => out.push({
          id: u.$id, type: 'user',
          label: u.name || u.email || 'Usuario',
          sub: u.email,
          href: `/admin/users`,
        }));
      }
      setResults(out);
    } catch {}
    finally { setIsSearching(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const ICON: Record<Result['type'], any> = {
    order: ShoppingCart, product: Package, user: Users,
  };
  const TYPE_LABEL: Record<Result['type'], string> = {
    order: 'Pedido', product: 'Producto', user: 'Usuario',
  };

  const kbdStyle: React.CSSProperties = {
    fontSize: 10, padding: '2px 6px', borderRadius: 5,
    background: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.38)',
    border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit',
    fontWeight: 600, letterSpacing: '.4px', lineHeight: 1.6,
  };

  if (!open) return (
    <>
      <style>{`
        @keyframes gs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes gs-cursor { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        .gs-cursor { display:inline-block; width:1.5px; height:13px; margin-left:2px; background:rgba(255,255,255,0.5); animation:gs-cursor 1s step-end infinite; vertical-align:middle; border-radius:1px; }
      `}</style>
      <div
        style={{
          position: 'relative', width: '100%', maxWidth: 580,
          borderRadius: 11, padding: 1.5, overflow: 'hidden', cursor: 'pointer',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setOpen(true)}
      >
        {/* Rotating spotlight — fixed 600×600 square always covers corners */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 600, height: 600,
          marginTop: -300, marginLeft: -300,
          background: hovered
            ? 'conic-gradient(from 0deg, transparent 0%, transparent 62%, rgba(255,255,255,0.35) 73%, rgba(255,255,255,0.95) 80%, rgba(255,255,255,0.35) 87%, transparent 100%)'
            : 'conic-gradient(from 0deg, transparent 0%, transparent 68%, rgba(255,255,255,0.2) 77%, rgba(255,255,255,0.6) 83%, rgba(255,255,255,0.2) 89%, transparent 100%)',
          animation: 'gs-spin 2.8s linear infinite',
          pointerEvents: 'none',
          transition: 'background .3s',
        }} />
        {/* Inner button */}
        <button
          style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 16px', borderRadius: 9.5, border: 'none', cursor: 'pointer',
            background: hovered ? '#282828' : '#1e1e1e',
            color: hovered ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.52)',
            fontSize: 13.5, fontWeight: 400, width: '100%',
            transition: 'background .2s, color .2s',
            letterSpacing: '.01em',
          }}
          title="Búsqueda global (Ctrl+K)"
        >
          <Search style={{
            width: 15, height: 15, flexShrink: 0,
            opacity: hovered ? 0.88 : 0.55,
            transition: 'opacity .2s, transform .2s',
            transform: hovered ? 'scale(1.12)' : 'scale(1)',
          }} />
          <span style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center' }}>
            {placeholder}<span className="gs-cursor" />
          </span>
          <span className="hidden sm:flex" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <kbd style={kbdStyle}>CTRL</kbd>
            <kbd style={kbdStyle}>K</kbd>
          </span>
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar pedidos, productos, usuarios..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          {isSearching && <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />}
          <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {results.length === 0 && query.length >= 2 && !isSearching ? (
          <div className="p-6 text-center text-sm text-gray-400">Sin resultados para «{query}»</div>
        ) : results.length === 0 && query.length < 2 ? (
          <div className="p-6 text-center text-xs text-gray-400">Escribe al menos 2 caracteres</div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {results.map(r => {
              const Icon = ICON[r.type];
              return (
                <Link key={r.id} href={r.href} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    r.type === 'order' ? 'bg-indigo-100 text-indigo-600' :
                    r.type === 'product' ? 'bg-emerald-100 text-emerald-600' :
                    'bg-violet-100 text-violet-600'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                    {r.sub && <p className="text-xs text-gray-400 truncate">{r.sub}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{TYPE_LABEL[r.type]}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
