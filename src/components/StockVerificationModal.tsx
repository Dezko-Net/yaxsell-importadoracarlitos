'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useCart } from '@/context/CartContext';
import { formatPrice } from '@/lib/db';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Loader2, 
  Sparkles, 
  ArrowRight, 
  ShoppingBag, 
  RefreshCw, 
  ShieldCheck,
  PackageX
} from 'lucide-react';
import Link from 'next/link';

interface StockVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemScanStatus {
  id: string;
  sku?: string;
  name: string;
  requestedQty: number;
  availableStock: number;
  adjustedQty: number;
  status: 'pending' | 'checking' | 'available' | 'out_of_stock' | 'adjusted' | 'blocked';
  reason: string;
  image?: string;
  isPack?: boolean;
}

export default function StockVerificationModal({
  isOpen,
  onClose,
  onSuccess,
}: StockVerificationModalProps) {
  const { items, removeItem, updateQuantity } = useCart();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'all_ok' | 'summary' | 'all_empty' | 'error'>('idle');
  const [scanItems, setScanItems] = useState<ItemScanStatus[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [removedItems, setRemovedItems] = useState<ItemScanStatus[]>([]);
  const [adjustedItems, setAdjustedItems] = useState<ItemScanStatus[]>([]);
  const [blockedItems, setBlockedItems] = useState<ItemScanStatus[]>([]);
  const [availableItems, setAvailableItems] = useState<ItemScanStatus[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isScanningRef = useRef(false);

  // Inicializar y disparar verificación al abrir
  useEffect(() => {
    if (!isOpen) {
      setPhase('idle');
      setScanItems([]);
      setCurrentIndex(0);
      setRemovedItems([]);
      setAdjustedItems([]);
      setBlockedItems([]);
      setAvailableItems([]);
      setErrorMessage(null);
      isScanningRef.current = false;
      return;
    }

    if (items.length === 0) {
      setPhase('all_empty');
      return;
    }

    // Preparar lista de productos a escanear
    const groupedItems = new Map<string, ItemScanStatus>();
    items.forEach(it => {
      const id = it.product.$id || it.product.SKU || '';
      const existing = groupedItems.get(id);
      if (existing) {
        existing.requestedQty += it.quantity;
        return;
      }
      groupedItems.set(id, {
        id,
        sku: it.product.SKU,
        name: it.product.NAME || 'Producto',
        requestedQty: it.quantity,
        availableStock: 0,
        adjustedQty: it.quantity,
        status: 'pending',
        reason: 'En espera...',
        image: it.product.IMAGEURL || (Array.isArray((it.product as any).IMAGES) ? (it.product as any).IMAGES[0] : '') || '',
        isPack: false,
      });
    });
    const initialList = [...groupedItems.values()];

    setScanItems(initialList);
    setPhase('scanning');
    setCurrentIndex(0);
    isScanningRef.current = true;

    // Ejecutar verificación contra Firestore backend
    runStockScan(initialList);
  }, [isOpen]);

  const runStockScan = async (itemList: ItemScanStatus[]) => {
    try {
      const payload = {
        mode: 'verify_cart',
        items: itemList.map((it) => ({
          id: it.id,
          sku: it.sku,
          name: it.name,
          qty: it.requestedQty,
          isPack: it.isPack,
        })),
      };

      const res = await fetch('/api/checkout/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Error al conectar con la base de datos de stock.');
      }

      const data = await res.json();
      const serverResults: any[] = data?.results || [];

      // Mapear resultados indexados
      const resultMap = new Map<string, any>();
      serverResults.forEach((sr) => {
        const variantKey = sr.isPack ? 'pack' : 'unit';
        if (sr.id) resultMap.set(`${String(sr.id)}|${variantKey}`, sr);
        if (sr.sku) resultMap.set(`${String(sr.sku).toLowerCase()}|${variantKey}`, sr);
        if (sr.id) resultMap.set(String(sr.id), sr);
        if (sr.sku) resultMap.set(String(sr.sku).toLowerCase(), sr);
      });

      // Efecto interactivo de escaneo secuencial (50ms por item, max 2.5s)
      const delayPerItem = Math.max(35, Math.min(80, Math.floor(1800 / (itemList.length || 1))));

      for (let i = 0; i < itemList.length; i++) {
        if (!isScanningRef.current) return;

        setCurrentIndex(i + 1);

        // Poner item actual en "checking"
        setScanItems((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: 'checking', reason: 'Consultando bodega...' } : item))
        );

        await new Promise((r) => setTimeout(r, delayPerItem));

        const it = itemList[i];
        const variantKey = it.isPack ? 'pack' : 'unit';
        const resForIt = resultMap.get(`${String(it.id)}|${variantKey}`) ||
          (it.sku ? resultMap.get(`${String(it.sku).toLowerCase()}|${variantKey}`) : null) ||
          resultMap.get(String(it.id)) ||
          (it.sku ? resultMap.get(String(it.sku).toLowerCase()) : null);

        let finalStatus: 'available' | 'out_of_stock' | 'adjusted' | 'blocked' = 'available';
        let availableStock = it.requestedQty;
        let adjustedQty = it.requestedQty;
        let reason = 'Disponible';

        if (resForIt) {
          finalStatus = resForIt.status;
          availableStock = resForIt.availableStock ?? 0;
          adjustedQty = resForIt.adjustedQty ?? 0;
          reason = resForIt.reason || (finalStatus === 'available' ? 'Disponible' : 'Sin stock');
        }

        // Actualizar item a su estado final
        setScanItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: finalStatus,
                  availableStock,
                  adjustedQty,
                  reason,
                }
              : item
          )
        );
      }

      // Procesar reconciliación en el carrito
      const removed: ItemScanStatus[] = [];
      const adjusted: ItemScanStatus[] = [];
      const blocked: ItemScanStatus[] = [];
      const available: ItemScanStatus[] = [];

      itemList.forEach((it) => {
        const variantKey = it.isPack ? 'pack' : 'unit';
        const resForIt = resultMap.get(`${String(it.id)}|${variantKey}`) ||
          (it.sku ? resultMap.get(`${String(it.sku).toLowerCase()}|${variantKey}`) : null) ||
          resultMap.get(String(it.id)) ||
          (it.sku ? resultMap.get(String(it.sku).toLowerCase()) : null);
        const status = resForIt?.status || 'available';
        const availStock = resForIt?.availableStock ?? it.requestedQty;
        const adjQty = resForIt?.adjustedQty ?? it.requestedQty;
        const itemObj = {
          ...it,
          status,
          availableStock: availStock,
          adjustedQty: adjQty,
          reason: resForIt?.reason || (status === 'available' ? 'Disponible' : 'Sin stock'),
        };

        if (status === 'out_of_stock') {
          removed.push(itemObj);
          // Si un componente del pack ya no existe, quitar el pack completo.
          const matching = items.filter(cartItem => cartItem.product.$id === it.id || (it.sku && cartItem.product.SKU === it.sku));
          matching.forEach(cartItem => removeItem(
            cartItem.product.$id || String(cartItem.product.SKU || ''),
            cartItem.bundleInstanceId ?? (cartItem.bundleId ? undefined : null),
          ));
        } else if (status === 'adjusted') {
          adjusted.push(itemObj);
          // Ajustar todas las líneas de este producto en conjunto para no
          // validar dos veces la misma disponibilidad cuando está en un pack.
          let remaining = adjQty;
          const matching = items.filter(cartItem => cartItem.product.$id === it.id || (it.sku && cartItem.product.SKU === it.sku));
          matching.forEach(cartItem => {
            const keepQty = Math.min(cartItem.quantity, remaining);
            remaining -= keepQty;
            if (keepQty < cartItem.quantity) {
              updateQuantity(
                cartItem.product.$id || String(cartItem.product.SKU || ''),
                keepQty,
                cartItem.isPack,
                availStock,
                Boolean(cartItem.isPack),
                cartItem.bundleInstanceId ?? (cartItem.bundleId ? undefined : null),
              );
            }
          });
          available.push(itemObj);
        } else if (status === 'blocked') {
          blocked.push(itemObj);
        } else {
          available.push(itemObj);
        }
      });

      setRemovedItems(removed);
      setAdjustedItems(adjusted);
      setBlockedItems(blocked);
      setAvailableItems(available);

      // Evaluar siguiente paso
      if (removed.length === 0 && adjusted.length === 0 && blocked.length === 0) {
        // Todo 100% disponible
        setPhase('all_ok');
        setTimeout(() => {
          if (isScanningRef.current) {
            onSuccess();
          }
        }, 900);
      } else if (available.length === 0 && blocked.length === 0) {
        // Todo el carrito se agotó
        setPhase('all_empty');
      } else {
        // Hubo cambios: mostrar resumen interactivo para que el usuario continúe informado
        setPhase('summary');
      }
    } catch (err: any) {
      console.error('Error durante la verificación interactiva de stock:', err);
      setErrorMessage(err?.message || 'Ocurrió un error temporal al verificar stock.');
      setPhase('error');
    }
  };

  if (!isOpen) return null;

  const totalToScan = scanItems.length;
  const progressPercent = totalToScan > 0 ? Math.min(100, Math.round((currentIndex / totalToScan) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      style={{ zIndex: 2147484030 }}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop bloqueante sin cierre al click exterior durante escaneo */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={() => {
          if (phase === 'summary' || phase === 'error' || phase === 'all_empty') {
            onClose();
          }
        }}
      />

      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl z-10 border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* ── FASE 1: ESCANEO EN TIEMPO REAL ── */}
        {phase === 'scanning' && (
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-3 shadow-inner relative">
              <Loader2 size={28} className="animate-spin text-blue-600" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 rounded-full animate-ping" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100/80 text-blue-700 text-xs font-black uppercase tracking-wider mb-2">
              <Sparkles size={13} className="animate-pulse" />
              Verificación en tiempo real
            </div>

            <h3 className="text-xl font-black text-gray-950 tracking-tight">
              Espere por favor...
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-xs font-medium">
              Estamos comprobando que los productos sigan en el catálogo y ajustando las cantidades con el stock registrado.
            </p>

            {/* Barra de Progreso */}
            <div className="w-full mt-5 mb-3">
              <div className="flex justify-between items-center text-xs font-bold text-gray-500 mb-1.5">
                <span>Comprobando productos</span>
                <span className="text-blue-600 font-extrabold">{currentIndex} de {totalToScan} ({progressPercent}%)</span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-200">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-150 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Lista interactiva de productos siendo revisados */}
            <div className="w-full mt-2 border border-gray-100 rounded-2xl bg-gray-50/70 p-2 max-h-56 overflow-y-auto space-y-1.5 text-left divide-y divide-gray-100">
              {scanItems.map((item, idx) => {
                const isCurrent = idx === currentIndex - 1 && item.status === 'checking';
                return (
                  <div
                    key={`${item.id}_${idx}`}
                    className={`pt-1.5 first:pt-0 flex items-center justify-between gap-2.5 p-1.5 rounded-xl transition-all ${
                      isCurrent
                        ? 'bg-blue-50/90 border border-blue-200 shadow-xs'
                        : item.status === 'out_of_stock'
                        ? 'bg-red-50/80 border border-red-200 opacity-90'
                        : item.status === 'blocked'
                        ? 'bg-amber-50/80 border border-amber-200'
                        : item.status === 'adjusted'
                        ? 'bg-amber-50/80 border border-amber-200'
                        : item.status === 'available'
                        ? 'bg-emerald-50/60'
                        : 'opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className={`w-9 h-9 rounded-lg object-contain bg-white border shrink-0 ${
                            item.status === 'out_of_stock' ? 'border-red-300 grayscale' : item.status === 'blocked' ? 'border-amber-300' : 'border-gray-200'
                          }`}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 text-xs">
                          📦
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-bold truncate ${
                            item.status === 'out_of_stock'
                              ? 'line-through text-red-900 font-semibold'
                              : 'text-gray-900'
                          }`}
                        >
                          {item.name}
                        </p>
                        <p className="text-[11px] text-gray-500 font-medium">
                          {item.status === 'out_of_stock' ? (
                            <span className="text-red-600 font-bold">{item.reason || 'No disponible para compra online'}</span>
                          ) : item.status === 'blocked' ? (
                            <span className="text-amber-800 font-bold">{item.reason}</span>
                          ) : item.status === 'adjusted' ? (
                            <span className="text-amber-700 font-bold">
                              Ajustado a {item.adjustedQty} uds (pediste {item.requestedQty})
                            </span>
                          ) : item.status === 'available' ? (
                            item.availableStock <= 0 ? (
                              <span className="text-amber-700 font-semibold">{item.reason}</span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">
                                {item.requestedQty} {item.requestedQty === 1 ? 'unidad' : 'unidades'} disponible(s)
                              </span>
                            )
                          ) : (
                            <span>{item.requestedQty} unidad(es)</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Indicador de Estado */}
                    <div className="shrink-0 flex items-center pr-1">
                      {item.status === 'pending' && (
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                      )}
                      {item.status === 'checking' && (
                        <Loader2 size={15} className="animate-spin text-blue-600" />
                      )}
                      {item.status === 'available' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          {item.availableStock <= 0 ? 'Conservado' : 'OK'}
                        </span>
                      )}
                      {item.status === 'out_of_stock' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-md animate-pulse">
                          <XCircle size={12} className="text-red-600" />
                          {item.reason.toLowerCase().includes('no existe') ? 'No existe' : 'Agotado'}
                        </span>
                      )}
                      {item.status === 'blocked' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                          <AlertTriangle size={12} className="text-amber-600" /> Sin stock
                        </span>
                      )}
                      {item.status === 'adjusted' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                          <AlertTriangle size={12} className="text-amber-600" /> Ajustado
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FASE 2: TODO DISPONIBLE (100% OK) ── */}
        {phase === 'all_ok' && (
          <div className="p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600 mb-4 shadow-sm">
              <CheckCircle2 size={36} className="text-emerald-600" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold uppercase tracking-wider mb-2">
              <ShieldCheck size={14} /> Stock Confirmado
            </div>

            <h3 className="text-2xl font-black text-gray-950 tracking-tight">
              Tu pedido está listo para continuar
            </h3>
            <p className="text-xs text-gray-600 mt-2 max-w-sm font-medium">
              Los productos de Importadora Carlitos con stock cero se conservan según la configuración de disponibilidad. Avanzando a la selección de pago...
            </p>

            <button
              type="button"
              onClick={onSuccess}
              style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
              className="mt-6 w-full py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base shadow-lg hover:shadow-xl active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              Continuar ahora <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ── FASE 3: RESUMEN DE CONCILIACIÓN (PRODUCTOS AGOTADOS / AJUSTADOS) ── */}
        {phase === 'summary' && (
          <div className="flex flex-col max-h-[85vh]">
            {/* Cabecera */}
            <div className="p-5 pb-3 border-b border-gray-100 bg-gradient-to-br from-amber-50/50 to-white">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-950 tracking-tight">
                    Actualizamos tu pedido con el stock real
                  </h3>
                  <p className="text-xs text-gray-600 mt-0.5 font-medium leading-relaxed">
                    {removedItems.length > 0 && (
                      <span>
                        Se quitaron <strong>{removedItems.length} producto(s) que ya no existen en el catálogo</strong>.
                      </span>
                    )}
                    {blockedItems.length > 0 && (
                      <span>
                        {' '}Hay <strong>{blockedItems.length} producto(s) sin stock de tienda aliada</strong>; permanecen en tu carrito y no se puede enviar ese pedido hasta que haya stock.
                      </span>
                    )}
                    {adjustedItems.length > 0 && (
                      <span>
                        {' '}Ajustamos la cantidad de <strong>{adjustedItems.length} producto(s)</strong> al stock máximo disponible.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Contenido scrolleable */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Sección de removidos */}
              {removedItems.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50/40 p-3.5">
                  <p className="text-xs font-black text-red-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <XCircle size={14} className="text-red-600" />
                    Productos que ya no existen ({removedItems.length})
                  </p>
                  <div className="space-y-2">
                    {removedItems.map((item, idx) => (
                      <div
                        key={`rem_${item.id}_${idx}`}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/90 border border-red-100"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt=""
                              className="w-8 h-8 rounded-lg object-contain bg-white border border-gray-200 shrink-0 grayscale opacity-80"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-xs">
                              📦
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-800 line-through truncate">{item.name}</p>
                            <p className="text-[10px] text-red-600 font-semibold">{item.reason}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded-full shrink-0">
                          Removido
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {blockedItems.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
                  <p className="text-xs font-black text-amber-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-600" />
                    Productos que requieren revisión; se conservan en el carrito
                  </p>
                  <div className="space-y-2">
                    {blockedItems.map((item, idx) => (
                      <div key={`blocked_${item.id}_${idx}`} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/90 border border-amber-100">
                        {item.image ? <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-contain bg-white border border-gray-200 shrink-0" /> : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-xs">📦</div>}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                          <p className="text-[10px] text-amber-800 font-semibold">{item.reason}</p>
                        </div>
                        <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">Se conserva</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sección de ajustados */}
              {adjustedItems.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3.5">
                  <p className="text-xs font-black text-amber-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-600" />
                    Cantidades ajustadas por stock ({adjustedItems.length})
                  </p>
                  <div className="space-y-2">
                    {adjustedItems.map((item, idx) => (
                      <div
                        key={`adj_${item.id}_${idx}`}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/90 border border-amber-100"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt=""
                              className="w-8 h-8 rounded-lg object-contain bg-white border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-xs">
                              📦
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                            <p className="text-[10px] text-amber-800 font-bold">
                              Quedan {item.adjustedQty} de las {item.requestedQty} pedidas
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                          {item.adjustedQty} uds
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mensaje positivo */}
              {blockedItems.length > 0 ? (
                <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 flex items-center gap-2.5">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-900 font-medium leading-relaxed">
                    No quitamos estos productos. Vuelve al carrito para retirarlos manualmente o espera a que la tienda aliada reponga stock.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200 flex items-center gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-900 font-medium leading-relaxed">
                    Tu carrito está actualizado. Las cantidades reflejan el stock real y los productos de Importadora Carlitos con stock cero se conservan según la configuración de disponibilidad.
                  </p>
                </div>
              )}
            </div>

            {/* Footer con Botones de Acción */}
            <div className="p-4 border-t border-gray-100 bg-white space-y-2">
              <button
                type="button"
                onClick={onSuccess}
                disabled={blockedItems.length > 0}
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                className="w-full py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base shadow-lg hover:shadow-xl active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {blockedItems.length > 0 ? 'No disponible hasta que la tienda tenga stock' : <>Continuar con mi pedido ({availableItems.length} {availableItems.length === 1 ? 'producto' : 'productos'}) <ArrowRight size={18} /></>}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-2xl font-bold text-xs sm:text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
              >
                Volver al carrito para revisar
              </button>
            </div>
          </div>
        )}

        {/* ── FASE 4: CARRITO QUEDÓ VACÍO (TODO AGOTADO) ── */}
        {phase === 'all_empty' && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 mb-4">
              <PackageX size={36} />
            </div>

            <h3 className="text-xl font-black text-gray-950 tracking-tight">
              No se encontraron los productos del carrito
            </h3>
            <p className="text-xs text-gray-600 mt-2 max-w-sm font-medium leading-relaxed">
              Se quitaron únicamente los productos que ya no existen en el catálogo. El stock cero de Importadora Carlitos no elimina productos del carrito.
            </p>

            <div className="mt-6 w-full space-y-2">
              <Link
                href="/catalogo"
                onClick={onClose}
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                className="w-full py-3 px-4 rounded-2xl font-black text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <ShoppingBag size={16} /> Ver catálogo con stock disponible
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* ── FASE 5: ERROR DE CONEXIÓN ── */}
        {phase === 'error' && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-3xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 mb-4">
              <AlertTriangle size={34} />
            </div>

            <h3 className="text-lg font-black text-gray-950 tracking-tight">
              No pudimos conectar con la base de datos
            </h3>
            <p className="text-xs text-gray-600 mt-2 max-w-sm font-medium">
              {errorMessage || 'Ocurrió un problema de conexión al comprobar el stock.'}
            </p>

            <div className="mt-6 w-full space-y-2">
              <button
                type="button"
                onClick={() => {
                  setPhase('scanning');
                  runStockScan(scanItems);
                }}
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                className="w-full py-3 px-4 rounded-2xl font-black text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> Reintentar verificación
              </button>
              <button
                type="button"
                onClick={onSuccess}
                className="w-full py-2.5 text-xs font-bold text-gray-600 hover:text-gray-900 transition"
              >
                Continuar de todas formas →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
