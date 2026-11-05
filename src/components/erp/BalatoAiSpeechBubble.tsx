'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Clock,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import PriceRecommendationsModal from './PriceRecommendationsModal';
import type { PriceRecommendation } from '@/app/api/erp/daily-ai-insight/route';

interface DayData {
  fecha: string;
  fechaFull: string;
  ventas: number;
  gastos: number;
  ganancia: number;
}

interface TopProduct {
  sku: string;
  nombre: string;
  cantidad: number;
  ventas: number;
  costoNeto: number;
  imageUrl?: string;
}

interface BalatoAiSpeechBubbleProps {
  totals: { ventas: number; gastos: number; ganancia: number };
  monthlyData: DayData[];
  topProducts: TopProduct[];
  loading?: boolean;
}

interface StoredInsight {
  fecha: string;
  generatedAt: string;
  timestamp: number;
  ventas: number;
  gastos: number;
  ganancia: number;
  margenPct: number;
  avgMarginPreviousDays: number;
  commentary: string;
  historyDays: Array<{
    fecha: string;
    label: string;
    ventas: number;
    gastos?: number;
    ganancia: number;
    margenPct: number;
  }>;
  priceRecommendations: PriceRecommendation[];
  isPreliminary?: boolean;
}

function getSantiagoInfo() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const timeStr = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const [h, m] = timeStr.split(':').map(Number);
  const isAfterCierre = h > 18 || (h === 18 && m >= 10);

  return { dateStr, timeStr, hour: h, minute: m, isAfterCierre };
}

export default function BalatoAiSpeechBubble({
  totals,
  monthlyData = [],
  topProducts = [],
  loading = false,
}: BalatoAiSpeechBubbleProps) {
  const [santiagoInfo, setSantiagoInfo] = useState(getSantiagoInfo());
  const [insight, setInsight] = useState<StoredInsight | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasAttemptedAuto, setHasAttemptedAuto] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSantiagoInfo(getSantiagoInfo());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const currentMargin = useMemo(() => {
    if (!totals || totals.ventas <= 0) return 0;
    return (totals.ganancia / totals.ventas) * 100;
  }, [totals]);

  const history7Days = useMemo(() => {
    const todayStr = santiagoInfo.dateStr;
    const partsToday = todayStr.split('-');
    const todayLabel = `${partsToday[2]}/${partsToday[1]}`;

    const prevDays = (monthlyData || [])
      .filter((d) => d.fechaFull && d.fechaFull !== todayStr && d.ventas > 0)
      .slice(-6)
      .map((d) => {
        const m = d.ventas > 0 ? (d.ganancia / d.ventas) * 100 : 0;
        return {
          fecha: d.fechaFull,
          label: d.fecha || d.fechaFull.slice(5),
          ventas: d.ventas,
          gastos: d.gastos,
          ganancia: d.ganancia,
          margenPct: Number(m.toFixed(1)),
        };
      });

    const todayItem = {
      fecha: todayStr,
      label: 'Hoy',
      ventas: totals.ventas,
      gastos: totals.gastos,
      ganancia: totals.ganancia,
      margenPct: Number(currentMargin.toFixed(1)),
    };

    return [...prevDays, todayItem];
  }, [monthlyData, totals, currentMargin, santiagoInfo.dateStr]);

  const liveFallbackCommentary = useMemo(() => {
    if (!totals || totals.ventas <= 0) {
      return `Aún no se registran ventas para este turno. El sistema está monitoreando en tiempo real cada transacción de caja.`;
    }

    const margin = currentMargin.toFixed(1);
    const avgPrev = history7Days.filter((d) => d.fecha !== santiagoInfo.dateStr && d.ventas > 0);
    const avgVal = avgPrev.length > 0
      ? (avgPrev.reduce((acc, d) => acc + d.margenPct, 0) / avgPrev.length).toFixed(1)
      : margin;
    const diff = Number(margin) - Number(avgVal);

    // Identificar productos que más o menos margen aportan hoy
    const sortedByMargin = [...topProducts]
      .filter((p) => p.ventas > 0)
      .map((p) => {
        const m = p.ventas > 0 ? ((p.ventas - (p.costoNeto || 0)) / p.ventas) * 100 : 0;
        return { ...p, marginPct: m };
      })
      .sort((a, b) => a.marginPct - b.marginPct);

    const lowMarginItem = sortedByMargin.find((p) => p.marginPct < 22);
    const highMarginItem = [...sortedByMargin].reverse().find((p) => p.marginPct > 30);

    let compText = '';
    if (diff < -2) {
      compText = `El margen de hoy se sitúa en un ${margin}%, ${Math.abs(diff).toFixed(1)} puntos por debajo del promedio reciente (${avgVal}%).`;
    } else if (diff > 2) {
      compText = `¡Excelente ritmo comercial! El margen de hoy alcanza un ${margin}%, superando en +${diff.toFixed(1)} puntos el promedio habitual (${avgVal}%).`;
    } else {
      compText = `El margen de hoy se mantiene estable en ${margin}%, perfectamente alineado con el promedio de la semana (${avgVal}%).`;
    }

    let detailText = ` Ventas acumuladas de $${totals.ventas.toLocaleString('es-CL')} con ganancia neta estimada de $${totals.ganancia.toLocaleString('es-CL')}.`;

    if (lowMarginItem) {
      detailText += ` Atención con "${lowMarginItem.nombre}", que opera con un margen estrecho del ${lowMarginItem.marginPct.toFixed(1)}% y tira el promedio hacia abajo.`;
    }
    if (highMarginItem && highMarginItem.sku !== lowMarginItem?.sku) {
      detailText += ` En contrapartida, "${highMarginItem.nombre}" sostiene una rentabilidad sólida del ${highMarginItem.marginPct.toFixed(1)}%.`;
    }

    return `${compText}${detailText}`;
  }, [totals, currentMargin, history7Days, topProducts, santiagoInfo.dateStr]);

  const fetchOrGenerateInsight = useCallback(
    async (forceGenerate = false, preliminary = true) => {
      if (isGenerating) return;
      try {
        setIsGenerating(true);

        if (!forceGenerate) {
          const res = await fetch(`/api/erp/daily-ai-insight?fecha=${santiagoInfo.dateStr}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.insight && data.insight.commentary) {
              setInsight(data.insight);
              setIsGenerating(false);
              return;
            }
          }
        }

        // Si no hay insight guardado o se solicita actualizar:
        // Generamos el análisis de inmediato para que NUNCA quede vacío
        if (totals.ventas > 0 || forceGenerate || preliminary) {
          const postRes = await fetch('/api/erp/daily-ai-insight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fecha: santiagoInfo.dateStr,
              ventas: totals.ventas,
              gastos: totals.gastos,
              ganancia: totals.ganancia,
              margenPct: currentMargin,
              historyDays: history7Days,
              topProducts: topProducts.slice(0, 15),
              isPreliminary: !santiagoInfo.isAfterCierre,
              force: forceGenerate,
            }),
          });

          if (postRes.ok) {
            const data = await postRes.json();
            if (data.success && data.insight) {
              setInsight(data.insight);
            }
          }
        }
      } catch (err) {
        console.error('[BalatoAiSpeechBubble] Error:', err);
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, santiagoInfo, totals, currentMargin, history7Days, topProducts]
  );

  useEffect(() => {
    if (loading || hasAttemptedAuto) return;
    setHasAttemptedAuto(true);
    // Ejecutar inmediatamente al montar para que Balato AI siempre tenga análisis
    fetchOrGenerateInsight(false, true);
  }, [loading, hasAttemptedAuto, fetchOrGenerateInsight]);

  useEffect(() => {
    if (santiagoInfo.isAfterCierre && (!insight || insight.isPreliminary) && !loading && !isGenerating) {
      fetchOrGenerateInsight(true, false);
    }
  }, [santiagoInfo.isAfterCierre]);

  const recommendations = insight?.priceRecommendations || [];
  const commentaryText = insight?.commentary || liveFallbackCommentary;

  return (
    <>
      {/* ── Genshin-style Character Notification / Speech Bubble ── */}
      <div className="relative flex items-start gap-2.5 sm:gap-3.5 my-1">
        {/* Avatar del Personaje (Genshin Style) */}
        <div className="relative flex-shrink-0 mt-0.5">
          <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full p-0.5 bg-gradient-to-tr from-emerald-400 via-teal-400 to-sky-400 shadow-md shadow-emerald-500/20 ring-2 ring-white">
            <img
              src="/avatar-ia-erp.png"
              alt="Balato AI"
              className="w-full h-full object-cover rounded-full bg-slate-100"
            />
          </div>
          {/* Status badge */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
            <Sparkles size={8} className="text-white" />
          </span>
        </div>

        {/* Nubecita de diálogo (Speech Bubble Blanca y Limpia) */}
        <div className="relative flex-1 min-w-0 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-md shadow-slate-200/40 p-3 sm:p-4 text-slate-800">
          {/* Tail / Piquito de la nubecita apuntando al avatar */}
          <div className="absolute top-3.5 -left-2 w-3.5 h-3.5 bg-white border-l border-b border-slate-200/90 rotate-45 pointer-events-none" />

          {/* Header de la nubecita */}
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                BALATO AI
              </span>
              <span className="text-[10px] text-slate-400">·</span>
              {insight && !insight.isPreliminary ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <CheckCircle2 size={9} /> Cierre oficial guardado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                  <Clock size={9} /> Cierre oficial 18:10 hrs ({santiagoInfo.timeStr})
                </span>
              )}
            </div>

            {/* Botón sutil de recálculo */}
            <button
              onClick={() => fetchOrGenerateInsight(true, !santiagoInfo.isAfterCierre)}
              disabled={isGenerating}
              className="text-[10px] text-slate-400 hover:text-emerald-600 transition flex items-center gap-1 disabled:opacity-50"
              title="Recalcular análisis"
            >
              <RefreshCw size={11} className={isGenerating ? 'animate-spin text-emerald-500' : ''} />
              <span className="hidden sm:inline">{isGenerating ? 'Analizando...' : 'Recalcular'}</span>
            </button>
          </div>

          {/* Mensaje de diálogo del personaje */}
          {isGenerating ? (
            <div className="flex items-center gap-2 py-1 text-slate-500 text-xs">
              <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span>Analizando rendimiento del turno y márgenes de hoy...</span>
            </div>
          ) : commentaryText ? (
            <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed font-normal">
              {commentaryText}
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-0.5 text-xs text-slate-600">
              <p>
                El análisis oficial se activará automáticamente a las <strong>18:10 hrs</strong>. Margen al momento:{' '}
                <strong className="text-emerald-600">{currentMargin.toFixed(1)}%</strong>.
              </p>
              <button
                onClick={() => fetchOrGenerateInsight(true, true)}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex-shrink-0 self-start sm:self-auto"
              >
                ⚡ Generar análisis preliminar ahora
              </button>
            </div>
          )}

          {/* Botón interactivo de recomendaciones integrado en la nubecita */}
          {recommendations.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-slate-500">
                💡 <strong>{recommendations.length} productos</strong> detectados para mejorar rentabilidad:
              </span>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-800 font-bold text-[11px] border border-emerald-200/80 shadow-xs transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <span>Ver productos que te recomiendo subir el precio</span>
                <ArrowRight size={11} className="text-emerald-600" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Recomendaciones de Precios */}
      <PriceRecommendationsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        recommendations={recommendations}
        isLoading={isGenerating}
      />
    </>
  );
}
