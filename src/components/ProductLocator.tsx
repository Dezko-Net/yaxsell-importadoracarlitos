'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Search, MapPin, Package, Camera, CheckCircle2, ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import dynamic from 'next/dynamic';
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

interface Product {
  $id: string;
  NAME?: string;
  IMAGEURL?: string;
  STOCK?: number;
  FEATURES?: string;
  TAGS?: string;
  jumpseller_id?: string;
  [key: string]: unknown;
}

const GONDOLAS = [
  { id: 'A', name: 'Góndola A', sections: [1,2,3,4,5,6,7,8,9], color: 'from-blue-500 to-indigo-600', light: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  { id: 'B', name: 'Góndola B', sections: [10,11,12,13,14,15,16,17,18], color: 'from-cyan-500 to-blue-600', light: 'bg-cyan-50 border-cyan-200', dot: 'bg-cyan-500' },
  { id: 'C', name: 'Góndola C', sections: [19,20,21,22,23,24,25,26,27], color: 'from-pink-500 to-rose-600', light: 'bg-pink-50 border-pink-200', dot: 'bg-pink-500' },
  { id: 'D', name: 'Góndola D', sections: [28,29,30,31,32,33,34,35,36], color: 'from-orange-500 to-red-600', light: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
];

function getFeaturesString(p: Product): string {
  if (!p || p.FEATURES == null) return '';
  const feat = p.FEATURES as any;
  if (typeof feat === 'string') return feat;
  if (Array.isArray(feat)) return feat.join(' ');
  try {
    return String(feat);
  } catch {
    return '';
  }
}

function getSku(p: Product): string {
  const featStr = getFeaturesString(p);
  const m = featStr ? featStr.match(/SKU:\s*(.+)/i) : null;
  if (m) return m[1].trim();
  const tags = Array.isArray(p.TAGS)
    ? p.TAGS
    : (typeof p.TAGS === 'string' ? p.TAGS.split(',').map(t => t.trim()) : []);
  const skuTag = tags.find(t => /^[A-Z0-9]{4,}$/i.test(t));
  const direct = (p as any).sku;
  if (direct && String(direct).trim()) return String(direct).trim();
  return p.jumpseller_id || skuTag || '';
}

function getBarcode(p: Product): string {
  const featStr = getFeaturesString(p);
  const m = featStr ? featStr.match(/Barcode:\s*(.+)/i) : null;
  if (m) return m[1].trim();
  const direct = (p as any).barcode;
  if (direct && String(direct).trim()) return String(direct).trim();
  return '';
}

function getSection(p: Product): number | null {
  const featStr = getFeaturesString(p);
  const m = featStr ? featStr.match(/Section:\s*(\d+)/i) : null;
  if (m) return parseInt(m[1], 10);
  const direct = (p as any).section;
  if (direct && Number(direct) > 0) return Number(direct);
  return null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onProductsUpdate: (updater: (prev: Product[]) => Product[]) => void;
  /** Colección donde guardar sección (por defecto catálogo publicado). */
  collectionId?: string;
  /** Productos publicados al catálogo (para buscar/ubicar también ahí). */
  publishedProducts?: Product[];
  /** Colección del catálogo publicado. */
  publishedCollectionId?: string;
  /** Callback para actualizar publishedProducts. */
  onPublishedProductsUpdate?: (updater: (prev: Product[]) => Product[]) => void;
}

type Screen = 'menu' | 'search' | 'register' | 'select-section';

export default function ProductLocator({ isOpen, onClose, products, onProductsUpdate, collectionId = PRODUCTS_COLLECTION_ID, publishedProducts = [], publishedCollectionId = PRODUCTS_COLLECTION_ID, onPublishedProductsUpdate }: Props) {
  // Combinar inventario + publicados (sin duplicados por $id)
  const allProducts = useMemo(() => {
    const ids = new Set(products.map(p => p.$id));
    return [...products, ...publishedProducts.filter(p => !ids.has(p.$id))];
  }, [products, publishedProducts]);
  const [screen, setScreen] = useState<Screen>('menu');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ product: Product; section: number }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<number | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [registerBulkScan, setRegisterBulkScan] = useState(false);
  const [registerManualSearch, setRegisterManualSearch] = useState(false);
  const [registerCandidates, setRegisterCandidates] = useState<Product[]>([]);
  const [lastPlacedSection, setLastPlacedSection] = useState<number | null>(null);
  const [expandedGondola, setExpandedGondola] = useState<string | null>(null);

  const sectionProductCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    allProducts.forEach(p => {
      const sec = getSection(p);
      if (sec != null && sec >= 1 && sec <= 36) counts[sec] = (counts[sec] || 0) + 1;
    });
    return counts;
  }, [allProducts]);

  const openRegisterScanner = useCallback(() => {
    setScreen('register');
    setQuery('');
    setSelectedProduct(null);
    setSavedSection(null);
    setRegisterManualSearch(false);
    setRegisterBulkScan(true);
    setShowScanner(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setScreen('menu');
      setQuery('');
      setSearchResults([]);
      setSelectedProduct(null);
      setSavedSection(null);
      setExpandedGondola(null);
      setShowScanner(false);
      setRegisterBulkScan(false);
      setRegisterManualSearch(false);
      setRegisterCandidates([]);
      setLastPlacedSection(null);
    }
  }, [isOpen]);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    const lower = q.toLowerCase().trim();
    const results: { product: Product; section: number }[] = [];
    allProducts.forEach(p => {
      const sec = getSection(p);
      if (sec === null) return;
      const sku = getSku(p).toLowerCase();
      const barcode = getBarcode(p).toLowerCase();
      const name = (p.NAME || '').toLowerCase();
      if (sku.includes(lower) || barcode.includes(lower) || name.includes(lower) || String(sec) === lower) {
        results.push({ product: p, section: sec });
      }
    });
    setSearchResults(results);
  }, [allProducts]);

  const doRegisterSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSelectedProduct(null);
      setRegisterCandidates([]);
      return;
    }
    const lower = trimmed.toLowerCase();

    const exact = allProducts.find(p => {
      const sku = getSku(p).toLowerCase();
      const barcode = getBarcode(p).toLowerCase();
      return sku === lower || barcode === lower;
    });
    if (exact) {
      setSelectedProduct(exact);
      setRegisterCandidates([]);
      setShowScanner(false);
      setScreen('register');
      return;
    }

    if (lower.length < 3) {
      setSelectedProduct(null);
      setRegisterCandidates([]);
      return;
    }

    const candidates = allProducts
      .filter(p => {
        const sku = getSku(p).toLowerCase();
        const barcode = getBarcode(p).toLowerCase();
        return sku.includes(lower) || barcode.includes(lower);
      })
      .slice(0, 15);

    setSelectedProduct(null);
    setRegisterCandidates(candidates);
  }, [allProducts]);

  const pickRegisterCandidate = (product: Product) => {
    setSelectedProduct(product);
    setRegisterCandidates([]);
    setQuery(getSku(product) || getBarcode(product));
    setShowScanner(false);
    setScreen('register');
  };

  const reopenRegisterScanner = useCallback(() => {
    setSelectedProduct(null);
    setQuery('');
    setSavedSection(null);
    setScreen('register');
    setRegisterManualSearch(false);
    setRegisterBulkScan(true);
    setShowScanner(true);
  }, []);

  const saveSection = async (sectionNum: number) => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      
      // Determinar en qué colección está el producto
      const isInventory = products.some(p => p.$id === selectedProduct.$id);
      const targetCollectionId = isInventory ? collectionId : publishedCollectionId;
      
      // Siempre guardar section en FEATURES como fallback
      const features = getFeaturesString(selectedProduct);
      const existing = features.replace(/\nSection:\s*\d+/gi, '').replace(/^Section:\s*\d+\n?/gi, '');
      const newFeatures = existing ? `${existing}\nSection: ${sectionNum}` : `Section: ${sectionNum}`;
      
      const payload: Record<string, any> = { FEATURES: newFeatures, section: sectionNum };
      
      try {
        await databases.updateDocument(databaseId, targetCollectionId, selectedProduct.$id, payload);
      } catch (err: any) {
        if (err?.message?.includes('Unknown attribute') || err?.message?.includes('unknown attribute')) {
          // El atributo section no existe en el schema, guardar solo en FEATURES
          await databases.updateDocument(databaseId, targetCollectionId, selectedProduct.$id, { FEATURES: newFeatures });
        } else {
          throw err;
        }
      }
      
      const updated = { ...selectedProduct, FEATURES: newFeatures, section: sectionNum };
      if (isInventory) {
        onProductsUpdate(prev => prev.map(p => p.$id === selectedProduct.$id ? updated : p));
      } else if (onPublishedProductsUpdate) {
        onPublishedProductsUpdate(prev => prev.map(p => p.$id === selectedProduct.$id ? updated : p));
      }
      setSavedSection(sectionNum);
      setLastPlacedSection(sectionNum);
      setTimeout(() => {
        reopenRegisterScanner();
      }, 700);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Error al guardar'));
    } finally {
      setSaving(false);
    }
  };

  const handleScan = (code: string) => {
    setShowScanner(false);
    setQuery(code);
    if (screen === 'search') {
      doSearch(code);
    } else if (screen === 'register' || registerBulkScan) {
      doRegisterSearch(code);
    }
  };

  const handleScannerClose = () => {
    setShowScanner(false);
    setRegisterBulkScan(false);
  };

  if (!isOpen) return null;

  const getGondolaForSection = (sec: number) => GONDOLAS.find(g => g.sections.includes(sec));

  return (
    <>
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={handleScannerClose}
          continuous={registerBulkScan && screen === 'register' && !selectedProduct}
        />
      )}
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
        <div
          className="bg-white w-full max-h-[92dvh] sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-4 flex items-center gap-3 shrink-0">
            {screen !== 'menu' && (
              <button
                type="button"
                onClick={() => {
                  if (screen === 'select-section') {
                    setScreen('register');
                    return;
                  }
                  setScreen('menu');
                  setShowScanner(false);
                  setRegisterBulkScan(false);
                }}
                className="p-1 hover:bg-white/20 rounded-lg transition"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <MapPin size={22} />
            <div className="flex-1">
              <h2 className="font-bold text-base">Ubicar Producto</h2>
              <p className="text-xs text-white/70">
                {screen === 'menu' ? 'Sistema de góndolas' : screen === 'search' ? 'Buscar por sección' : screen === 'register' ? 'Registrar ubicación' : 'Seleccionar sección'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition"><X size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {screen === 'menu' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setScreen('search'); setQuery(''); setSearchResults([]); setRegisterManualSearch(false); }}
                    className="flex flex-col items-center gap-3 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl hover:border-blue-400 transition group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition">
                      <Search size={24} className="text-white" />
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-gray-900 text-sm">Buscar Sección</div>
                      <div className="text-xs text-gray-500 mt-0.5">¿Dónde está un producto?</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={openRegisterScanner}
                    className="flex flex-col items-center gap-3 p-5 bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl hover:border-emerald-400 transition group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition">
                      <MapPin size={24} className="text-white" />
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-gray-900 text-sm">Registrar Sección</div>
                      <div className="text-xs text-gray-500 mt-0.5">Escaneo masivo</div>
                    </div>
                  </button>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Mapa de Góndolas</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      {GONDOLAS.filter(g => g.id === 'A').map(g => {
                        const prodCount = allProducts.filter(p => { const s = getSection(p); return s !== null && g.sections.includes(s); }).length;
                        const expanded = expandedGondola === g.id;
                        return (
                          <div key={g.id} className={`${g.light} border rounded-xl overflow-hidden`}>
                            <button type="button" onClick={() => setExpandedGondola(expanded ? null : g.id)} className="w-full flex items-center gap-2 p-3">
                              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${g.color} flex items-center justify-center text-white text-xs font-black shrink-0`}>{g.id}</div>
                              <div className="flex-1 text-left">
                                <div className="text-xs font-bold text-gray-700">{g.name}</div>
                                <div className="text-[10px] text-gray-500">{prodCount} productos</div>
                              </div>
                              {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                            </button>
                            {expanded && (
                              <div className="grid grid-cols-3 gap-1 px-3 pb-3">
                                {g.sections.map(s => {
                                  const has = allProducts.some(p => getSection(p) === s);
                                  return (
                                    <div key={s} className={`text-center py-1.5 rounded text-[11px] font-bold ${has ? `${g.dot} text-white` : 'bg-white/70 text-gray-400'}`}>{s}</div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-2">
                      {GONDOLAS.filter(g => g.id !== 'A').map(g => {
                        const prodCount = allProducts.filter(p => { const s = getSection(p); return s !== null && g.sections.includes(s); }).length;
                        const expanded = expandedGondola === g.id;
                        return (
                          <div key={g.id} className={`${g.light} border rounded-xl overflow-hidden`}>
                            <button type="button" onClick={() => setExpandedGondola(expanded ? null : g.id)} className="w-full flex items-center gap-2 p-3">
                              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${g.color} flex items-center justify-center text-white text-xs font-black shrink-0`}>{g.id}</div>
                              <div className="flex-1 text-left">
                                <div className="text-xs font-bold text-gray-700">{g.name}</div>
                                <div className="text-[10px] text-gray-500">{prodCount} prods.</div>
                              </div>
                              {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                            </button>
                            {expanded && (
                              <div className="grid grid-cols-3 gap-1 px-3 pb-3">
                                {g.sections.map(s => {
                                  const has = allProducts.some(p => getSection(p) === s);
                                  return (
                                    <div key={s} className={`text-center py-1.5 rounded text-[11px] font-bold ${has ? `${g.dot} text-white` : 'bg-white/70 text-gray-400'}`}>{s}</div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {screen === 'search' && (
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); }}
                      placeholder="SKU, código de barras, nombre o # sección"
                      className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button type="button" onClick={() => setShowScanner(true)} className="p-3 bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition">
                    <Camera size={20} />
                  </button>
                </div>
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map(({ product, section }) => {
                      const gondola = getGondolaForSection(section);
                      return (
                        <div key={product.$id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          {product.IMAGEURL ? (
                            <img src={product.IMAGEURL} alt="" className="w-12 h-12 object-cover rounded-lg" />
                          ) : (
                            <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center"><Package size={18} className="text-gray-400" /></div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 line-clamp-1">{product.NAME}</div>
                            <div className="text-[11px] text-gray-500 font-mono">SKU: {getSku(product)}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r ${gondola?.color || 'from-gray-400 to-gray-600'} text-white text-xs font-bold`}>
                              <MapPin size={12} /> S{section}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{gondola?.name}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : query.trim() ? (
                  <div className="text-center py-10 text-gray-400 text-sm">No se encontró el producto en ninguna sección</div>
                ) : (
                  <div className="text-center py-10 text-gray-400 text-sm">Busca un producto o escribe un # de sección</div>
                )}
              </div>
            )}

            {screen === 'register' && !selectedProduct && (
              <div className="p-4 space-y-4">
                {!registerManualSearch ? (
                  <div className="text-center py-8 space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center">
                      <Camera size={32} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Modo escaneo masivo</p>
                      <p className="text-sm text-gray-500 mt-1">Escanea el producto, elige la sección y vuelve al lector automáticamente</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setRegisterBulkScan(true); setShowScanner(true); }}
                      className="w-full py-3.5 bg-emerald-600 text-white font-bold rounded-xl shadow-md"
                    >
                      Abrir lector de códigos
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRegisterManualSearch(true); setRegisterCandidates([]); setSelectedProduct(null); setQuery(''); }}
                      className="text-xs text-gray-500 underline"
                    >
                      Buscar por SKU manualmente
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          value={query}
                          onChange={(e) => { setQuery(e.target.value); doRegisterSearch(e.target.value); }}
                          placeholder="SKU o código de barras"
                          inputMode="search"
                          className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <button type="button" onClick={() => { setRegisterBulkScan(true); setShowScanner(true); }} className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                        <Camera size={20} />
                      </button>
                    </div>
                    <button type="button" onClick={() => { setRegisterManualSearch(false); setRegisterCandidates([]); setQuery(''); }} className="text-xs text-gray-400">
                      ← Volver al escaneo con cámara
                    </button>
                    {registerCandidates.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        <p className="text-xs text-gray-500 font-medium">Coincidencias — toca el producto correcto:</p>
                        {registerCandidates.map(p => (
                          <button
                            key={p.$id}
                            type="button"
                            onClick={() => pickRegisterCandidate(p)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 text-left transition"
                          >
                            {p.IMAGEURL ? (
                              <img src={p.IMAGEURL} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                <Package size={20} className="text-gray-300" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-gray-900 line-clamp-2">{p.NAME}</div>
                              <div className="text-[11px] text-gray-500 font-mono mt-0.5">SKU: {getSku(p) || '—'}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : query.trim().length > 0 && query.trim().length < 3 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">Escribe al menos 3 caracteres del SKU o código</div>
                    ) : query.trim().length >= 3 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">No hay coincidencias. Sigue escribiendo el SKU completo.</div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 text-sm">Escribe el SKU o código completo, o escanea</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {screen === 'register' && selectedProduct && !savedSection && (
              <div className="p-5 flex flex-col items-center gap-4">
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Producto encontrado</div>
                {selectedProduct.IMAGEURL ? (
                  <img src={selectedProduct.IMAGEURL} alt="" className="w-40 h-40 object-cover rounded-2xl shadow-lg border-4 border-white" />
                ) : (
                  <div className="w-40 h-40 bg-gray-100 rounded-2xl flex items-center justify-center"><Package size={40} className="text-gray-300" /></div>
                )}
                <div className="text-center">
                  <div className="font-bold text-gray-900 text-lg">{selectedProduct.NAME}</div>
                  <div className="text-xs font-mono text-gray-500 mt-1">SKU: {getSku(selectedProduct)}</div>
                  {getSection(selectedProduct) && (
                    <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                      <MapPin size={12} /> Actualmente en Sección {getSection(selectedProduct)}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setScreen('select-section')}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg text-sm">
                  ¿Es este? Asignar sección →
                </button>
                <button type="button" onClick={reopenRegisterScanner}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">No es este, escanear otro</button>
              </div>
            )}

            {screen === 'select-section' && selectedProduct && (
              <div className="p-4">
                {savedSection ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center animate-bounce">
                      <CheckCircle2 size={32} className="text-emerald-600" />
                    </div>
                    <div className="text-lg font-bold text-emerald-700">¡Guardado en sección {savedSection}!</div>
                    <div className="text-sm text-gray-500">Abriendo lector para el siguiente...</div>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-4">
                      <div className="text-sm font-bold text-gray-900 line-clamp-1">{selectedProduct.NAME}</div>
                      <div className="text-xs text-gray-500">Toca la sección donde pusiste este producto</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        {GONDOLAS.filter(g => g.id === 'A').map(g => (
                          <div key={g.id} className={`${g.light} border rounded-2xl p-3`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center text-white text-xs font-black shadow`}>{g.id}</div>
                              <div className="text-xs font-bold text-gray-700">{g.name}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {g.sections.map(s => {
                                const count = sectionProductCounts[s] || 0;
                                const isLast = lastPlacedSection === s;
                                return (
                                  <button key={s} type="button" onClick={() => saveSection(s)} disabled={saving}
                                    className={`relative py-3 rounded-xl text-center font-black text-base border-2 transition-all active:scale-95 ${
                                      isLast
                                        ? 'bg-emerald-500 border-emerald-600 text-white ring-2 ring-emerald-300'
                                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50'
                                    } ${saving ? 'opacity-50 cursor-wait' : ''}`}>
                                    {count > 0 && (
                                      <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center leading-none shadow">
                                        {count > 99 ? '99+' : count}
                                      </span>
                                    )}
                                    {s}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-3">
                        {GONDOLAS.filter(g => g.id !== 'A').map(g => (
                          <div key={g.id} className={`${g.light} border rounded-2xl p-3`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center text-white text-xs font-black shadow`}>{g.id}</div>
                              <div className="text-xs font-bold text-gray-700">{g.name}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {g.sections.map(s => {
                                const count = sectionProductCounts[s] || 0;
                                const isLast = lastPlacedSection === s;
                                return (
                                  <button key={s} type="button" onClick={() => saveSection(s)} disabled={saving}
                                    className={`relative py-2 rounded-lg text-center font-black text-sm border-2 transition-all active:scale-95 ${
                                      isLast
                                        ? 'bg-emerald-500 border-emerald-600 text-white ring-2 ring-emerald-300'
                                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50'
                                    } ${saving ? 'opacity-50 cursor-wait' : ''}`}>
                                    {count > 0 && (
                                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-indigo-600 text-white text-[8px] font-bold flex items-center justify-center leading-none shadow">
                                        {count > 99 ? '99+' : count}
                                      </span>
                                    )}
                                    {s}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
