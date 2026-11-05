'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchAllFirebaseErpProducts, updateFirebaseErpProduct, FirebaseErpProduct } from '@/lib/firebaseErpService';
import { openReceiptPrintWindow, ReceiptData } from '@/lib/posReceipt';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, ArrowRightLeft,
  X, Check, Package, RefreshCw, Printer, AlertTriangle, CheckCircle, Zap, Image as ImageIcon, ArrowLeft
} from 'lucide-react';

interface CartItem {
  product: FirebaseErpProduct;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  subtotal: number;
}

type MetodoPago = 'efectivo' | 'debito' | 'transferencia';

export default function StandalonePosCajaPage() {
  const [catalog, setCatalog] = useState<FirebaseErpProduct[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [descuentoGlobalPct, setDescuentoGlobalPct] = useState<number>(0);
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [efectivoPagadoStr, setEfectivoPagadoStr] = useState<string>('');
  const [processingSale, setProcessingSale] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadCatalog = async (force = false) => {
    setLoadingCatalog(true);
    try {
      const items = await fetchAllFirebaseErpProducts(force);
      setCatalog(items);
    } catch (e: any) {
      setMessage({ text: 'Error cargando catálogo: ' + e.message, type: 'error' });
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadCatalog(false);
  }, []);

  useEffect(() => {
    if (searchInputRef.current && !showCheckoutModal) {
      searchInputRef.current.focus();
    }
  }, [showCheckoutModal, cart]);

  const addToCart = (product: FirebaseErpProduct) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.$id === product.$id);
      if (existingIndex >= 0) {
        const copy = [...prev];
        const current = copy[existingIndex];
        const newQty = current.cantidad + 1;
        const subtotal = Math.round(newQty * current.precioUnitario * (1 - current.descuentoPct / 100));
        copy[existingIndex] = { ...current, cantidad: newQty, subtotal };
        return copy;
      } else {
        const subtotal = Math.round(product.precio_venta_1);
        return [
          ...prev,
          {
            product,
            cantidad: 1,
            precioUnitario: product.precio_venta_1,
            descuentoPct: 0,
            subtotal,
          },
        ];
      }
    });
    setSearch('');
  };

  // Helper para normalizar texto de búsqueda
  const normText = (s: unknown): string => {
    return String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      const q = normText(search);
      const exactMatch = catalog.find(
        (p) => normText(p.codigo_barra) === q || normText(p.sku) === q
      );

      if (exactMatch) {
        addToCart(exactMatch);
        return;
      }

      const filtered = filteredCatalog;
      if (filtered.length === 1) {
        addToCart(filtered[0]);
      }
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.$id === productId) {
            const newQty = Math.max(1, item.cantidad + delta);
            const subtotal = Math.round(newQty * item.precioUnitario * (1 - item.descuentoPct / 100));
            return { ...item, cantidad: newQty, subtotal };
          }
          return item;
        })
        .filter((item) => item.cantidad > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.$id !== productId));
  };

  const subtotalTotal = useMemo(() => cart.reduce((sum, item) => sum + item.subtotal, 0), [cart]);
  const descuentoMonto = useMemo(() => Math.round((subtotalTotal * descuentoGlobalPct) / 100), [subtotalTotal, descuentoGlobalPct]);
  const totalFinal = useMemo(() => Math.max(0, subtotalTotal - descuentoMonto), [subtotalTotal, descuentoMonto]);

  const efectivoPagado = Number(efectivoPagadoStr) || 0;
  const vuelto = Math.max(0, efectivoPagado - totalFinal);

  const filteredCatalog = useMemo(() => {
    const cleanSearch = normText(search);
    if (!cleanSearch) return [];
    const tokens = cleanSearch.split(' ').filter(Boolean);
    if (tokens.length === 0) return [];

    return catalog
      .filter((p) => {
        if (!p) return false;
        const nombreNorm = normText(p.nombre);
        const skuNorm = normText(p.sku);
        const barcodeNorm = normText(p.codigo_barra);
        const fullText = `${nombreNorm} ${skuNorm} ${barcodeNorm}`;
        return tokens.every((token) => fullText.includes(token));
      })
      .slice(0, 25);
  }, [catalog, search]);

  const handleProcessSale = async () => {
    if (cart.length === 0) return;
    if (metodoPago === 'efectivo' && efectivoPagado < totalFinal) {
      setMessage({ text: 'El efectivo entregado es menor al total a pagar.', type: 'error' });
      return;
    }

    setProcessingSale(true);
    try {
      for (const item of cart) {
        const newStock = Math.max(0, item.product.stock - item.cantidad);
        await updateFirebaseErpProduct(item.product.$id, { stock: newStock });
      }

      const receiptData: ReceiptData = {
        tipoComprobante: 'comprobante',
        fechaHora: new Date().toLocaleString('es-CL'),
        cajeraNombre: 'Caja Principal',
        sedeNombre: 'Yaxsel Comercial',
        items: cart.map((i) => ({
          sku: i.product.sku,
          nombre: i.product.nombre,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          subtotal: i.subtotal,
          packageQty: i.product.packageQty,
        })),
        subtotal: subtotalTotal,
        descuentoGlobalMonto: descuentoMonto,
        total: totalFinal,
        metodoPago,
        efectivoPagado: metodoPago === 'efectivo' ? efectivoPagado : undefined,
        vuelto: metodoPago === 'efectivo' ? vuelto : undefined,
      };

      openReceiptPrintWindow(receiptData);

      setCart([]);
      setShowCheckoutModal(false);
      setEfectivoPagadoStr('');
      setMessage({ text: 'Venta procesada y stock descontado con éxito.', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
      loadCatalog();
    } catch (e: any) {
      setMessage({ text: 'Error procesando venta: ' + e.message, type: 'error' });
    } finally {
      setProcessingSale(false);
    }
  };

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(Math.round(Number(n) || 0));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Header Independiente sin Sidebar */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <Link href="/pos-admin" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">Caja Registradora POS — Yaxsel</h1>
            <p className="text-slate-400 text-xs font-mono">Conectado a Firebase (stock en vivo)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadCatalog(true)}
            disabled={loadingCatalog}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold transition border border-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCatalog ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Recargar Catálogo ({catalog.length})</span>
          </button>
        </div>
      </header>

      {/* Toast Message */}
      {message && (
        <div
          className={`mx-6 mt-4 p-4 rounded-xl text-sm font-medium border flex items-center gap-2 shadow-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Layout POS */}
      <main className="flex-1 grid grid-cols-12 gap-6 p-6 min-h-0">
        <section className="col-span-12 lg:col-span-7 flex flex-col gap-4">
          <div className="relative">
            <Search className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Escanea el código de barras o busca un producto... (ENTER para agregar)"
              className="w-full bg-white border-2 border-emerald-500/80 rounded-2xl pl-13 pr-4 py-4 text-slate-900 placeholder-slate-400 text-base font-medium shadow-md focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition"
            />
          </div>

          {filteredCatalog.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100">
              {filteredCatalog.map((p) => (
                <div
                  key={p.$id}
                  onClick={() => addToCart(p)}
                  className="p-3.5 hover:bg-emerald-50/80 cursor-pointer flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.nombre} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-slate-400" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{p.nombre}</div>
                      <div className="text-xs text-slate-400 font-mono">SKU: {p.sku} | Barcode: {p.codigo_barra || 'Sin código'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-emerald-700 text-base">{fmtCLP(p.precio_venta_1)}</div>
                    <div className={`text-xs font-bold ${p.stock > 0 ? 'text-slate-500' : 'text-rose-500'}`}>Stock: {p.stock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex-1 flex flex-col justify-center items-center text-center">
            <Zap className="w-12 h-12 text-emerald-500 mb-3" />
            <h3 className="text-lg font-bold text-slate-900">Escáner 0ms Activo</h3>
            <p className="text-slate-500 text-sm max-w-md mt-1">
              Escanea el código de barra con la lectora o presiona ENTER para agregar directamente el producto a la caja registradora.
            </p>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2 font-black text-slate-900 text-lg">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <span>Carrito de Compras ({cart.reduce((s, i) => s + i.cantidad, 0)})</span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Vaciar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1 space-y-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                <ShoppingCart className="w-12 h-12 mb-2 stroke-1" />
                <p className="text-sm font-medium">Carrito vacío</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.$id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{item.product.nombre}</div>
                    <div className="text-xs text-slate-500 font-mono">{fmtCLP(item.precioUnitario)} c/u</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.product.$id, -1)}
                      className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-slate-900 text-sm">{item.cantidad}</span>
                    <button
                      onClick={() => updateQuantity(item.product.$id, 1)}
                      className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right flex items-center gap-2">
                    <span className="font-black text-slate-900 text-sm">{fmtCLP(item.subtotal)}</span>
                    <button
                      onClick={() => removeFromCart(item.product.$id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 font-medium">Subtotal:</span>
              <span className="font-bold text-slate-900">{fmtCLP(subtotalTotal)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 font-medium">Descuento Global (%):</span>
              <input
                type="number"
                min="0"
                max="100"
                value={descuentoGlobalPct}
                onChange={(e) => setDescuentoGlobalPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                className="w-20 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-right text-slate-900 font-bold text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between text-xl font-black text-slate-900 pt-2 border-t border-slate-100">
              <span>TOTAL A PAGAR:</span>
              <span className="text-emerald-600 text-2xl">{fmtCLP(totalFinal)}</span>
            </div>

            <button
              onClick={() => setShowCheckoutModal(true)}
              disabled={cart.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 text-white font-black py-4 rounded-2xl text-lg shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
            >
              <Banknote className="w-6 h-6" />
              <span>COBRAR ({fmtCLP(totalFinal)})</span>
            </button>
          </div>
        </section>
      </main>

      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900">Finalizar Venta</h2>
              <button onClick={() => setShowCheckoutModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Método de Pago</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setMetodoPago('efectivo')}
                  className={`p-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition ${
                    metodoPago === 'efectivo' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Banknote className="w-5 h-5" /> Efectivo
                </button>
                <button
                  onClick={() => setMetodoPago('debito')}
                  className={`p-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition ${
                    metodoPago === 'debito' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <CreditCard className="w-5 h-5" /> Débito
                </button>
                <button
                  onClick={() => setMetodoPago('transferencia')}
                  className={`p-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition ${
                    metodoPago === 'transferencia' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <ArrowRightLeft className="w-5 h-5" /> Transferencia
                </button>
              </div>
            </div>

            {metodoPago === 'efectivo' && (
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-medium">Efectivo Entregado:</span>
                  <input
                    type="number"
                    value={efectivoPagadoStr}
                    onChange={(e) => setEfectivoPagadoStr(e.target.value)}
                    placeholder="Monto $"
                    className="w-32 bg-white border border-slate-300 rounded-xl px-3 py-2 text-right font-bold text-slate-900 text-base focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>VUELTO:</span>
                  <span className="text-emerald-600 text-xl">{fmtCLP(vuelto)}</span>
                </div>
              </div>
            )}

            <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">Total a Pagar:</span>
              <span className="text-2xl font-black text-emerald-400">{fmtCLP(totalFinal)}</span>
            </div>

            <button
              onClick={handleProcessSale}
              disabled={processingSale}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-base shadow-lg transition flex items-center justify-center gap-2"
            >
              <Printer className="w-5 h-5" />
              <span>{processingSale ? 'Procesando Venta...' : 'CONFIRMAR E IMPRIMIR COMPROBANTE'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
