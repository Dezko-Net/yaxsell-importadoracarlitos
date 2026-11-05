'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Activity, Calendar, ChevronRight, X, Sparkles, ArrowRight } from 'lucide-react';

interface DayData {
  fecha: string;
  fechaFull: string;
  ventas: number;
  gastos: number;
  ganancia: number;
}

interface MarginHistoryChartCardProps {
  totals: { ventas: number; gastos: number; ganancia: number };
  monthlyData: DayData[];
  loading?: boolean;
}

type RangeOption = '7D' | '14D' | 'MES';

export default function MarginHistoryChartCard({
  totals,
  monthlyData = [],
  loading = false,
}: MarginHistoryChartCardProps) {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<RangeOption>('MES');
  const [selectedDay, setSelectedDay] = useState<any | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mouse drag-to-scroll support for desktop
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasMovedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasTodaySales = Boolean(totals && totals.ventas > 0);

  // Margen de hoy (solo si hay ventas activas)
  const currentMargin = useMemo(() => {
    if (!hasTodaySales) return 0;
    return (totals.ganancia / totals.ventas) * 100;
  }, [hasTodaySales, totals]);

  // Historial completo combinando monthlyData y hoy
  const fullChartData = useMemo(() => {
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const formatDay = (d: DayData) => {
      let realGanancia = d.ganancia;
      if (realGanancia >= d.ventas && d.ventas > 0) {
        realGanancia = Math.max(0, Math.round(d.ventas * 0.35 - d.gastos));
      }
      const m = d.ventas > 0 ? (realGanancia / d.ventas) * 100 : 0;
      return {
        fechaFull: d.fechaFull,
        label: d.fecha || d.fechaFull.slice(5),
        ventas: d.ventas,
        gastos: d.gastos,
        ganancia: realGanancia,
        margenPct: Number(m.toFixed(1)),
        isToday: false,
      };
    };

    const validPrev = (monthlyData || [])
      .filter((d) => d.fechaFull && d.fechaFull !== todayStr && d.ventas > 0)
      .map(formatDay);

    if (hasTodaySales) {
      const todayItem = {
        fechaFull: todayStr,
        label: 'Hoy',
        ventas: totals.ventas,
        gastos: totals.gastos,
        ganancia: totals.ganancia,
        margenPct: Number(currentMargin.toFixed(1)),
        isToday: true,
      };
      return [...validPrev, todayItem];
    } else {
      return validPrev;
    }
  }, [monthlyData, totals, currentMargin, hasTodaySales]);

  // Filtrado según rango seleccionado
  const chartData = useMemo(() => {
    if (range === '7D') return fullChartData.slice(-7);
    if (range === '14D') return fullChartData.slice(-14);
    return fullChartData;
  }, [fullChartData, range]);

  // Promedio semanal / de la selección
  const avgMargin = useMemo(() => {
    const valid = chartData.filter((d) => d.ventas > 0);
    if (valid.length === 0) return hasTodaySales ? currentMargin : 0;
    return valid.reduce((acc, d) => acc + d.margenPct, 0) / valid.length;
  }, [chartData, currentMargin, hasTodaySales]);

  // Mejor día de margen en la serie actual
  const bestDay = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((prev, curr) => (curr.margenPct > prev.margenPct ? curr : prev), chartData[0]);
  }, [chartData]);

  const diffFromAvg = hasTodaySales ? currentMargin - avgMargin : 0;

  // Ancho mínimo por punto para deslizamiento táctil ultra cómodo (52px por día)
  const chartWidth = useMemo(() => {
    return Math.max(420, chartData.length * 64);
  }, [chartData.length]);

  const isScrollable = chartWidth > 420 && chartData.length > 6;

  // Auto-scroll al final (días más recientes / Hoy) al montar o cambiar rango
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollLeft = el.scrollWidth;
    const timer = setTimeout(() => {
      if (el) el.scrollLeft = el.scrollWidth;
    }, 80);
    return () => clearTimeout(timer);
  }, [range, chartData.length, mounted]);

  // Handlers para arrastre con mouse (desktop) y touch
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftStartRef.current = scrollRef.current.scrollLeft;
    hasMovedRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.3;
    if (Math.abs(walk) > 4) {
      hasMovedRef.current = true;
    }
    scrollRef.current.scrollLeft = scrollLeftStartRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  // Click en un punto de la gráfica
  const handleChartClick = (state: any) => {
    if (hasMovedRef.current) return; // Si estaba arrastrando/deslizando, no activar click
    let day = null;
    if (state && state.activePayload && state.activePayload.length > 0) {
      day = state.activePayload[0].payload;
    } else if (state && typeof state.activeTooltipIndex === 'number' && chartData[state.activeTooltipIndex]) {
      day = chartData[state.activeTooltipIndex];
    }
    if (day) {
      setSelectedDay((prev: any) => (prev?.fechaFull === day.fechaFull ? null : day));
    }
  };

  // Custom Tooltip limpio y descriptivo
  const CustomTooltip = ({ active, payload, coordinate }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    const viewport = scrollRef.current;
    const viewportWidth = viewport?.clientWidth ?? 0;
    // Recharts reports the point in the full chart's coordinates. Convert it
    // to the currently visible viewport before deciding which way to open.
    const pointX = (coordinate?.x ?? 0) - (viewport?.scrollLeft ?? 0);
    const openToLeft = viewportWidth > 0 && pointX > viewportWidth * 0.68;
    const openToRight = viewportWidth > 0 && pointX < viewportWidth * 0.32;

    return (
      <div
        className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-xl p-2.5 text-xs text-slate-800 min-w-[160px] pointer-events-none z-50"
        style={
          openToLeft
            ? { transform: 'translateX(-105%)' }
            : openToRight
              ? { transform: 'translateX(105%)' }
              : undefined
        }
      >
        <p className="font-black text-slate-900 mb-1 pb-1 border-b border-slate-100 flex items-center justify-between">
          <span>{data.isToday ? 'Hoy (Turno en vivo)' : `Día ${data.label}`}</span>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
            {data.margenPct}%
          </span>
        </p>
        <div className="space-y-0.5 text-[11px]">
          <p className="flex justify-between text-slate-500">
            <span>Ventas:</span>
            <span className="font-bold text-slate-700">${data.ventas.toLocaleString('es-CL')}</span>
          </p>
          <p className="flex justify-between text-slate-500">
            <span>Gastos:</span>
            <span className="font-bold text-rose-600">${data.gastos.toLocaleString('es-CL')}</span>
          </p>
          <p className="flex justify-between text-slate-500">
            <span>Ganancia:</span>
            <span className="font-bold text-emerald-600">${data.ganancia.toLocaleString('es-CL')}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDay(data);
          }}
          className="mt-1.5 w-full cursor-pointer bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-1 px-2 rounded-lg text-[9.5px] transition-colors flex items-center justify-between shadow-xs pointer-events-auto"
        >
          <span>Ver detalle del día</span>
          <span className="text-[10px] font-black">👉</span>
        </button>
      </div>
    );
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Soft gradient accent */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/20 blur-3xl" />

      {/* Header con Título y Selectores de Rango */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25 flex-shrink-0">
            <TrendingUp size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-black text-slate-900">Historial de margen</p>
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/60">
                <Activity size={11} /> Interactivo
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              {chartData.length} días · Promedio {range === 'MES' ? 'del mes' : `de ${range.toLowerCase()}`}: <strong className="text-emerald-700">{avgMargin.toFixed(1)}%</strong>
            </p>
          </div>
        </div>

        {/* Chips de Selección de Rango */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 flex-shrink-0" aria-label="Rango del historial">
          {(['7D', '14D', 'MES'] as RangeOption[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setRange(opt);
                setSelectedDay(null);
              }}
              aria-pressed={range === opt}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                range === opt
                  ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/70'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {opt === 'MES' ? 'Mes' : opt}
            </button>
          ))}
        </div>
      </div>

      {/* Ficha Didáctica Interactiva al Tocar un Día */}
      {selectedDay ? (
        <div className="relative rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-slate-50 p-2.5 mb-2 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-600 text-white text-[10px] font-black">
                📅
              </span>
              <p className="text-xs font-black text-slate-900">
                {selectedDay.isToday ? 'Turno en vivo (Hoy)' : `Día inspeccionado: ${selectedDay.label}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-white/80 hover:bg-white px-1.5 py-0.5 rounded-md border border-slate-200"
            >
              <X size={11} /> Cerrar ficha
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-white/90 rounded-lg p-1 border border-emerald-200/70 shadow-2xs">
              <p className="text-[8px] font-bold text-emerald-700 uppercase">Margen</p>
              <p className="text-xs font-black text-emerald-900">{selectedDay.margenPct}%</p>
            </div>
            <div className="bg-white/90 rounded-lg p-1 border border-slate-200/70 shadow-2xs">
              <p className="text-[8px] font-bold text-slate-500 uppercase">Ventas</p>
              <p className="text-xs font-black text-slate-800 truncate">
                ${Math.round(selectedDay.ventas / 1000).toLocaleString('es-CL')}k
              </p>
            </div>
            <div className="bg-white/90 rounded-lg p-1 border border-slate-200/70 shadow-2xs">
              <p className="text-[8px] font-bold text-slate-500 uppercase">Ganancia</p>
              <p className="text-xs font-black text-emerald-700 truncate">
                ${Math.round(selectedDay.ganancia / 1000).toLocaleString('es-CL')}k
              </p>
            </div>
            <div className="bg-white/90 rounded-lg p-1 border border-slate-200/70 shadow-2xs">
              <p className="text-[8px] font-bold text-slate-500 uppercase">Gastos</p>
              <p className="text-xs font-black text-rose-600 truncate">
                ${Math.round(selectedDay.gastos).toLocaleString('es-CL')}
              </p>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-600 bg-white/60 px-2 py-0.5 rounded-md">
            <span className="font-semibold">
              {selectedDay.margenPct >= 20 ? (
                <span className="text-emerald-700 font-bold">🔥 Día de alto rendimiento comercial (&ge;20%)</span>
              ) : selectedDay.margenPct >= 15 ? (
                <span className="text-teal-700 font-bold">✅ Rendimiento saludable dentro del estándar</span>
              ) : (
                <span className="text-amber-700 font-bold">⚠️ Margen bajo el promedio habitual</span>
              )}
            </span>
            <span className="text-slate-400 font-medium">
              {selectedDay.margenPct >= avgMargin
                ? `+${(selectedDay.margenPct - avgMargin).toFixed(1)}% vs promedio`
                : `${(selectedDay.margenPct - avgMargin).toFixed(1)}% vs promedio`}
            </span>
          </div>
        </div>
      ) : (
        /* Mini KPIs Strip Normal */
        <div className="relative grid grid-cols-3 gap-2 mb-3">
          {/* Margen Hoy */}
          <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Margen de hoy</p>
            {hasTodaySales ? (
              <div className="flex items-baseline gap-1">
                <p className="text-base sm:text-lg font-black text-emerald-800 tabular-nums">
                  {currentMargin.toFixed(1)}%
                </p>
                <span
                  className={`text-[8.5px] font-bold ${
                    diffFromAvg >= 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {diffFromAvg >= 0 ? `+${diffFromAvg.toFixed(1)}%` : `${diffFromAvg.toFixed(1)}%`}
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-1">
                <p className="text-xs sm:text-sm font-black text-slate-400 tabular-nums">--</p>
                <span className="text-[8px] font-semibold text-slate-400">Sin ventas</span>
              </div>
            )}
          </div>

          {/* Promedio Seleccionado */}
          <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2.5">
            <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">
              Promedio {range}
            </p>
            <p className="text-base sm:text-lg font-black text-slate-800 tabular-nums">
              {avgMargin.toFixed(1)}%
            </p>
          </div>

          {/* Mejor Margen */}
          {bestDay && (
            <div className="rounded-xl border border-teal-200/70 bg-gradient-to-br from-teal-50 to-white px-3 py-2.5">
              <p className="text-[8.5px] font-bold uppercase tracking-wider text-teal-700">Mejor Día</p>
              <p className="text-base sm:text-lg font-black text-teal-800 tabular-nums truncate">
                {bestDay.margenPct.toFixed(1)}% <span className="text-[8.5px] text-teal-600 font-bold">({bestDay.label})</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Indicador didáctico de deslizamiento táctil */}
      {isScrollable && (
        <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium px-1 mb-1">
          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
            👈 Desliza con el dedo para ver días anteriores
          </span>
          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
              }
            }}
            className="text-[8.5px] font-bold text-slate-500 hover:text-emerald-700 underline"
          >
            Ir a hoy / más reciente 👉
          </button>
        </div>
      )}

      {/* Recharts Area Chart Deslizable con Contenedor Táctil */}
      <div className="relative h-[190px] sm:h-[220px] w-full border border-slate-200/70 rounded-xl bg-gradient-to-b from-slate-50/80 to-white p-2">
        {loading || !mounted ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs">
            Cargando historial de márgenes...
          </div>
        ) : (
          <div
            ref={scrollRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            className="h-full w-full overflow-x-auto overflow-y-hidden touch-pan-x cursor-grab active:cursor-grabbing select-none scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div style={{ width: `${chartWidth}px`, minWidth: `${chartWidth}px`, maxWidth: 'none', height: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  onClick={handleChartClick}
                  margin={{ top: 8, right: 12, left: -2, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="marginChartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 8.5, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  {avgMargin > 0 && (
                    <ReferenceLine
                      y={Number(avgMargin.toFixed(1))}
                      stroke="#6366f1"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: `Prom ${avgMargin.toFixed(0)}%`,
                        position: 'insideTopRight',
                        dx: -4,
                        dy: -2,
                        fill: '#6366f1',
                        fontSize: 8.5,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  {selectedDay && (
                    <ReferenceLine
                      x={selectedDay.label}
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="2 2"
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="margenPct"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#marginChartGrad)"
                    dot={{ fill: '#10b981', r: 3.5, strokeWidth: 1.5, stroke: '#ffffff' }}
                    activeDot={{
                      fill: '#059669',
                      r: 6.5,
                      strokeWidth: 2.5,
                      stroke: '#ffffff',
                      onClick: (_e: any, payload: any) => {
                        if (payload?.payload) setSelectedDay(payload.payload);
                      },
                    }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Selector rápido de días (pills táctiles) */}
      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 px-0.5">
        <span className="text-[10px] font-bold text-slate-500 flex-shrink-0 mr-0.5">Días</span>
        {chartData.map((d) => (
          <button
            key={d.fechaFull}
            type="button"
            onClick={() => setSelectedDay((prev: any) => (prev?.fechaFull === d.fechaFull ? null : d))}
            aria-label={`Ver margen del ${d.isToday ? 'día de hoy' : d.fechaFull}`}
            aria-pressed={selectedDay?.fechaFull === d.fechaFull}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-lg flex-shrink-0 transition-all ${
              selectedDay?.fechaFull === d.fechaFull
                ? 'bg-emerald-600 text-white shadow-xs scale-105'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <p className="mt-1 text-[8.5px] text-slate-400 text-center select-none">
        💡 Desliza la gráfica para recorrer fechas o selecciona un día para ver su detalle.
      </p>
    </div>
  );
}
