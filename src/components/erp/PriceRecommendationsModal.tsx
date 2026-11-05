'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  TrendingUp,
  DollarSign,
  Search,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Package,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { PriceRecommendation } from '@/app/api/erp/daily-ai-insight/route';

interface PriceRecommendationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendations: PriceRecommendation[];
  isLoading?: boolean;
}

function ProductPhoto({ src, alt }: { src?: string; alt: string }) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center flex-shrink-0 text-slate-400">
        <Package size={24} />
      </div>
    );
  }

  return (
    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-xs">
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setError(true)}
      />
    </div>
  );
}

export default function PriceRecommendationsModal({
  isOpen,
  onClose,
  recommendations = [],
  isLoading = false,
}: PriceRecommendationsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const filteredRecs = useMemo(() => {
    if (!searchTerm.trim()) return recommendations;
    const q = searchTerm.toLowerCase();
    return recommendations.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.motivo.toLowerCase().includes(q)
    );
  }, [recommendations, searchTerm]);

  const totals = useMemo(() => {
    const totalExtra = recommendations.reduce((acc, r) => acc + (r.gananciaExtraEstimada || 0), 0);
    const avgMarginDelta =
      recommendations.length > 0
        ? recommendations.reduce((acc, r) => acc + (r.margenSugeridoPct - r.margenActualPct), 0) /
          recommendations.length
        : 0;
    return {
      totalExtra,
      avgMarginDelta,
      count: recommendations.length,
    };
  }, [recommendations]);

  const handleCopySku = (sku: string) => {
    navigator.clipboard.writeText(sku);
    setCopiedSku(sku);
    setTimeout(() => setCopiedSku(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-3 md:p-5 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`relative flex flex-col bg-white overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'fixed inset-0 w-full h-full rounded-none z-50'
            : 'w-full h-full sm:max-w-6xl sm:h-[95vh] rounded-none sm:rounded-3xl border-0 sm:border border-slate-200 shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-4 py-3.5 sm:px-6 sm:py-4.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50/50 via-white to-teal-50/40 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl p-0.5 bg-gradient-to-tr from-emerald-400 via-teal-400 to-sky-400 shadow-md shadow-emerald-500/20 ring-2 ring-white">
                <img
                  src="/avatar-ia-erp.png"
                  alt="Balato AI"
                  className="w-full h-full object-cover rounded-[14px] bg-slate-50"
                />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
                <Sparkles size={9} className="text-white" />
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-lg font-black text-slate-900 truncate">
                  Recomendaciones de Precios y Margen
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Balato AI
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                {recommendations.length} productos detectados para elevar rentabilidad sin perder volumen
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Toggle pantalla completa */}
            <button
              onClick={() => setIsFullscreen((v) => !v)}
              className="hidden sm:flex p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title={isFullscreen ? 'Ventana normal' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            {/* Cerrar */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Cerrar ventana"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Summary Metrics Bar (Responsive Desktop & Mobile) */}
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50/90 border-b border-slate-100 flex-shrink-0">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 p-2 sm:p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0 border border-emerald-200/60">
                <DollarSign size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-500 block truncate">
                  Ganancia Extra
                </span>
                <span className="text-xs sm:text-base font-black text-emerald-700 truncate block">
                  +${totals.totalExtra.toLocaleString('es-CL')} <span className="text-[9px] font-normal text-slate-400 hidden sm:inline">/ mes</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 p-2 sm:p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold flex-shrink-0 border border-teal-200/60">
                <TrendingUp size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-500 block truncate">
                  Aumento Margen
                </span>
                <span className="text-xs sm:text-base font-black text-teal-700 truncate block">
                  +{totals.avgMarginDelta.toFixed(1)}% <span className="text-[9px] font-normal text-slate-400 hidden sm:inline">pts</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 p-2 sm:p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0 border border-indigo-200/60">
                <Package size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-500 block truncate">
                  Oportunidades
                </span>
                <span className="text-xs sm:text-base font-black text-indigo-700 truncate block">
                  {totals.count} <span className="text-[9px] font-normal text-slate-400">SKUs</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-3.5 py-2.5 sm:px-6 border-b border-slate-100 flex items-center gap-3 bg-white flex-shrink-0">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar por SKU, nombre del producto o motivo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex-shrink-0"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3 sm:space-y-3.5 bg-slate-50/50">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-600">Analizando márgenes y catálogo en vivo...</p>
            </div>
          ) : filteredRecs.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs">
              <Package size={40} className="mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-base font-bold text-slate-700">
                No se encontraron recomendaciones con los filtros actuales
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Tus productos de mayor rotación actualmente operan con márgenes comerciales estables.
              </p>
            </div>
          ) : (
            filteredRecs.map((rec, index) => {
              const marginDelta = rec.margenSugeridoPct - rec.margenActualPct;
              const priceDelta = rec.precioSugerido - rec.precioActual;

              return (
                <div
                  key={`${rec.sku}-${index}`}
                  className="bg-white p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition flex flex-col gap-3"
                >
                  {/* Top: Product Info & Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <ProductPhoto src={rec.imageUrl} alt={rec.nombre} />

                      <div className="min-w-0 flex-1">
                        <h4 className="font-black text-xs sm:text-sm text-slate-900 leading-snug">
                          {rec.nombre}
                        </h4>

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200/60">
                            {rec.sku}
                          </span>

                          <button
                            onClick={() => handleCopySku(rec.sku)}
                            className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 font-semibold"
                            title="Copiar SKU"
                          >
                            {copiedSku === rec.sku ? (
                              <span className="text-emerald-600 flex items-center gap-0.5 font-bold">
                                <Check size={11} /> Copiado
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5">
                                <Copy size={11} /> Copiar SKU
                              </span>
                            )}
                          </button>

                          {rec.unidadesVendidas > 0 && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                              {rec.unidadesVendidas} unids recientes
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Desktop Direct link to ERP Database */}
                    <a
                      href={`/erp-dashboard/base-datos?search=${encodeURIComponent(rec.sku)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-600 hover:text-white transition text-slate-700 text-xs font-bold border border-slate-200/80 shadow-2xs flex-shrink-0"
                      title="Editar en Base de Datos"
                    >
                      <span>Editar en BD</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>

                  {/* Middle: Comparative Cards (Optimized for Mobile & Desktop) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                    {/* Precio Actual */}
                    <div className="p-2 sm:p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">
                        Precio Actual
                      </span>
                      <span className="text-xs sm:text-sm font-black text-slate-700 block">
                        ${rec.precioActual.toLocaleString('es-CL')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold block">
                        Margen: {rec.margenActualPct.toFixed(1)}%
                      </span>
                    </div>

                    {/* Precio Sugerido */}
                    <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                      <span className="text-[9px] uppercase font-bold text-emerald-800 block">
                        Precio Sugerido
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs sm:text-sm font-black text-emerald-900">
                          ${rec.precioSugerido.toLocaleString('es-CL')}
                        </span>
                        <span className="text-[9px] font-bold text-emerald-700">
                          (+${priceDelta.toLocaleString('es-CL')})
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 block">
                        Margen: {rec.margenSugeridoPct.toFixed(1)}%
                      </span>
                    </div>

                    {/* Ganancia Extra Estimada */}
                    <div className="p-2 sm:p-2.5 rounded-xl bg-teal-50/60 border border-teal-200/80 col-span-1 sm:col-span-1">
                      <span className="text-[9px] uppercase font-bold text-teal-800 block">
                        Ganancia Extra
                      </span>
                      <span className="text-xs sm:text-sm font-black text-teal-900 block">
                        +${rec.gananciaExtraEstimada.toLocaleString('es-CL')}
                      </span>
                      <span className="text-[10px] text-teal-700 font-semibold block">
                        proyectado mensual
                      </span>
                    </div>

                    {/* Salto de Margen */}
                    <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80 col-span-1 sm:col-span-1 flex flex-col justify-center">
                      <span className="text-[9px] uppercase font-bold text-indigo-700 block">
                        Salto Margen
                      </span>
                      <span className="text-xs sm:text-sm font-black text-indigo-900 block">
                        +{marginDelta.toFixed(1)}% pts
                      </span>
                      <span className="text-[10px] text-indigo-600 font-semibold block">
                        markup protegido
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Motivo & Mobile Action */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                    <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200/60 flex-1">
                      💡 <strong>Estrategia Balato:</strong> {rec.motivo}
                    </p>

                    <a
                      href={`/erp-dashboard/base-datos?search=${encodeURIComponent(rec.sku)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sm:hidden flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 transition"
                    >
                      <span>Editar Precio en Base de Datos</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 bg-white border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <p className="text-[10px] sm:text-[11px] text-slate-500 flex items-center gap-1">
            <AlertCircle size={13} className="text-emerald-600 flex-shrink-0" />
            <span className="truncate">Precios sugeridos con terminación comercial chilena ($990, $1.490, etc.)</span>
          </p>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition shadow-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
