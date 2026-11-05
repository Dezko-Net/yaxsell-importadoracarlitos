'use client';

import Link from 'next/link';
import { Store, CheckCircle2, Globe, RefreshCw, Hourglass } from 'lucide-react';

interface ProductFlowNavProps {
  currentStep: 1 | 2 | 3 | 4;
  reviewCount?: number;
  webCount?: number;
  storeCount?: number;
  outOfStockCount?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function ProductFlowNav({
  currentStep,
  reviewCount,
  webCount,
  storeCount,
  outOfStockCount,
  onRefresh,
  refreshing,
}: ProductFlowNavProps) {
  return (
    <div className="lg:hidden bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-2 py-1">
      <div className="flex items-center justify-between gap-1 overflow-x-auto [scrollbar-width:none]">
        {/* Paso 1: Tienda */}
        <Link
          href="/admin/store-catalog"
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-black whitespace-nowrap transition-all shrink-0 ${
            currentStep === 1
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Store size={12} className={currentStep === 1 ? 'text-indigo-400' : 'text-slate-500'} />
          <span>1. Tienda</span>
          {storeCount !== undefined && storeCount > 0 && (
            <span className={`text-[9px] font-bold px-1 py-0.2 rounded-full ${
              currentStep === 1 ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {storeCount}
            </span>
          )}
        </Link>

        {/* Paso 2: Revisión Web */}
        <Link
          href="/admin/store-catalog/revision-web"
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-black whitespace-nowrap transition-all shrink-0 ${
            currentStep === 2
              ? 'bg-amber-500 text-white shadow-xs'
              : 'bg-amber-50 text-amber-800 border border-amber-200/70 hover:bg-amber-100'
          }`}
        >
          <CheckCircle2 size={12} className={currentStep === 2 ? 'text-white' : 'text-amber-600'} />
          <span>2. Revisión</span>
          {reviewCount !== undefined && reviewCount > 0 && (
            <span className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
              currentStep === 2 ? 'bg-white/25 text-white' : 'bg-amber-200 text-amber-900'
            }`}>
              {reviewCount}
            </span>
          )}
        </Link>

        {/* Paso 3: Publicados Web */}
        <Link
          href="/admin/products"
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-black whitespace-nowrap transition-all shrink-0 ${
            currentStep === 3
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-purple-50 text-purple-800 border border-purple-200/70 hover:bg-purple-100'
          }`}
        >
          <Globe size={12} className={currentStep === 3 ? 'text-white' : 'text-purple-600'} />
          <span>3. Web</span>
          {webCount !== undefined && webCount > 0 && (
            <span className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
              currentStep === 3 ? 'bg-white/25 text-white' : 'bg-purple-200 text-purple-900'
            }`}>
              {webCount}
            </span>
          )}
        </Link>

        {/* Paso 4: Espera Stock */}
        <Link
          href="/admin/products?stock=out"
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-black whitespace-nowrap transition-all shrink-0 ${
            currentStep === 4
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-rose-50 text-rose-800 border border-rose-200/70 hover:bg-rose-100'
          }`}
        >
          <Hourglass size={12} className={currentStep === 4 ? 'text-white' : 'text-rose-600'} />
          <span>4. Espera Stock</span>
          {outOfStockCount !== undefined && outOfStockCount > 0 && (
            <span className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
              currentStep === 4 ? 'bg-white/25 text-white' : 'bg-rose-200 text-rose-900'
            }`}>
              {outOfStockCount}
            </span>
          )}
        </Link>

        {/* Botón Refrescar */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 active:scale-95 transition shrink-0 cursor-pointer disabled:opacity-40"
            title="Actualizar datos"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}
