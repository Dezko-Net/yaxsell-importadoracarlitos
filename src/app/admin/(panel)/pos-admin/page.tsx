'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { fetchAllFirebaseErpProducts, FirebaseErpProduct } from '@/lib/firebaseErpService';
import {
  CreditCard, ShoppingCart, RotateCcw, FileText, Store, Clock, Lock, Users, Package,
  Tags, BarChart3, Settings, ChevronDown, ChevronRight, Menu, X, ArrowLeft, Boxes,
  ArrowRightLeft, ClipboardList, Warehouse, PackageCheck, PackageMinus, TrendingUp,
  Building2, UserCog, RefreshCw, CheckCircle, EyeOff, Save, Search, Image as ImageIcon,
  Database,
} from 'lucide-react';

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n));

export default function PosAdminExactHubPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'caja' | 'productos' | 'ventas' | 'cierres'>('dashboard');
  const [products, setProducts] = useState<FirebaseErpProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [editDraft, setEditDraft] = useState<Record<string, Partial<FirebaseErpProduct>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadCatalog = async (force = false) => {
    setLoading(true);
    try {
      const items = await fetchAllFirebaseErpProducts(force);
      setProducts(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog(false);
  }, []);

  const stats = useMemo(() => {
    const total = products.length;
    const conFoto = products.filter((p) => Boolean(p.imageUrl)).length;
    const sinFoto = total - conFoto;
    const conStock = products.filter((p) => p.stock > 0).length;
    return { total, conFoto, sinFoto, conStock };
  }, [products]);

  const normText = (s: unknown): string => {
    return String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const filteredProducts = useMemo(() => {
    const cleanSearch = normText(search);
    if (!cleanSearch) return products;
    const tokens = cleanSearch.split(' ').filter(Boolean);
    if (tokens.length === 0) return products;

    return products.filter((p) => {
      if (!p) return false;
      const nombreNorm = normText(p.nombre);
      const skuNorm = normText(p.sku);
      const barcodeNorm = normText(p.codigo_barra);
      const fullText = `${nombreNorm} ${skuNorm} ${barcodeNorm}`;
      return tokens.every((token) => fullText.includes(token));
    });
  }, [products, search]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Top Header POS Admin */}
      <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center text-white font-bold shadow-sm">
            <Store size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900 leading-none">Administrador POS</h1>
              <span className="bg-sky-50 text-sky-700 border border-sky-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Yaxsel Principal
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1 font-mono">Conectado a Appwrite Cloud (Stock unificado)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/erp-dashboard/base-datos"
            className="flex items-center gap-2 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 hover:border-purple-400 font-bold px-4 py-2 rounded-xl text-sm transition shadow-xs"
          >
            <Database size={16} className="text-purple-600" />
            <span>Base de Datos</span>
          </Link>
          <Link
            href="/admin/pos-admin/caja"
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition shadow-sm"
          >
            <ShoppingCart size={16} />
            <span>Ir a POS (Caja)</span>
          </Link>
        </div>
      </header>

      {/* Sub Navegación por Pestañas Superior */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-2 overflow-x-auto text-sm font-semibold">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition ${
            activeTab === 'dashboard' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <BarChart3 size={16} />
          <span>Dashboard POS</span>
        </button>

        <button
          onClick={() => setActiveTab('productos')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition ${
            activeTab === 'productos' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Package size={16} />
          <span>Productos & Inventario ({products.length})</span>
        </button>

        <Link
          href="/admin/pos-admin/caja"
          className="flex items-center gap-2 px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition"
        >
          <ShoppingCart size={16} />
          <span>Punto de Venta (Caja)</span>
        </Link>
      </div>

      {/* Contenido Principal */}
      <main className="p-6 md:p-8 flex-1 max-w-[1600px] w-full mx-auto space-y-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                <div className="text-xs text-gray-500 font-semibold">Total Productos</div>
                <div className="text-3xl font-black text-gray-900 mt-1">{loading ? '...' : stats.total}</div>
              </div>
              <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                <div className="text-xs text-emerald-600 font-bold">Con Foto (Publicados Web)</div>
                <div className="text-3xl font-black text-emerald-600 mt-1">{loading ? '...' : stats.conFoto}</div>
              </div>
              <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                <div className="text-xs text-amber-600 font-bold">Sin Foto (Solo POS)</div>
                <div className="text-3xl font-black text-amber-600 mt-1">{loading ? '...' : stats.sinFoto}</div>
              </div>
              <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                <div className="text-xs text-sky-600 font-bold">Con Stock Disponible</div>
                <div className="text-3xl font-black text-sky-600 mt-1">{loading ? '...' : stats.conStock}</div>
              </div>
            </div>

            {/* Accesos Rápidos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Link
                href="/admin/pos-admin/caja"
                className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold">
                    <ShoppingCart size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base group-hover:text-sky-600 transition">Abrir Caja POS</h3>
                    <p className="text-gray-500 text-xs mt-0.5">Escáner de barra, cobro e impresión de boleta 80mm</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-400 group-hover:translate-x-1 transition" />
              </Link>

              <button
                onClick={() => setActiveTab('productos')}
                className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                    <Package size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base group-hover:text-emerald-600 transition">Gestión de Productos</h3>
                    <p className="text-gray-500 text-xs mt-0.5">Ver y editar stock/precios directamente en Appwrite</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-400 group-hover:translate-x-1 transition" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'productos' && (
          <div className="space-y-6">
            {/* Buscador de Productos */}
            <div className="relative">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por Nombre, SKU o Código de Barras..."
                className="w-full bg-white border border-gray-300 rounded-xl pl-12 pr-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-sky-500 text-sm shadow-sm font-medium"
              />
            </div>

            {/* Tabla de Productos */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-700">
                  <thead className="bg-gray-100 text-xs uppercase tracking-wider text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="py-3.5 px-4">Producto</th>
                      <th className="py-3.5 px-4">SKU / Código</th>
                      <th className="py-3.5 px-4 text-right">Costo Uni</th>
                      <th className="py-3.5 px-4 text-right">Precio Venta</th>
                      <th className="py-3.5 px-4 text-center">Stock</th>
                      <th className="py-3.5 px-4 text-center">Estado Web</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 font-sans">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                          Cargando catálogo desde Appwrite...
                        </td>
                      </tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 font-sans">
                          No se encontraron productos.
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => {
                        const isWebVisible = p.isactive && p.stock > 0 && Boolean(p.imageUrl);
                        return (
                          <tr key={p.$id} className="hover:bg-gray-50 transition">
                            <td className="py-3 px-4 font-sans font-semibold text-gray-900 max-w-[300px]">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                                  {p.imageUrl ? (
                                    <img src={p.imageUrl} alt={p.nombre} className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon className="w-5 h-5 text-gray-400" />
                                  )}
                                </div>
                                <span className="line-clamp-2 text-sm">{p.nombre}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="text-gray-900 font-bold">{p.sku}</div>
                              <div className="text-gray-400">{p.codigo_barra || 'Sin código'}</div>
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600 font-semibold">{fmtCLP(p.costo_uni)}</td>
                            <td className="py-3 px-4 text-right text-sky-700 font-black">{fmtCLP(p.precio_venta_1)}</td>
                            <td className="py-3 px-4 text-center font-bold text-gray-900">{p.stock}</td>
                            <td className="py-3 px-4 text-center font-sans text-xs">
                              {isWebVisible ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-bold">
                                  Publicado Web
                                </span>
                              ) : !p.imageUrl ? (
                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-bold">
                                  Sin Foto (Solo POS)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full font-medium">
                                  Sin Stock
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
