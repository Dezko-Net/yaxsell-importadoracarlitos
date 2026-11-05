'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  Database,
  RefreshCw,
  Shield,
  TrendingUp,
  Clock,
  BarChart3,
  Layers,
  Server,
  Calendar,
  Flame,
  Globe,
  Wifi,
  Cpu,
  HardDrive,
  Store,
  Sparkles,
} from 'lucide-react';

/* ─── Types ─── */
type UsageData = {
  databaseReadsTotal: number;
  databaseWritesTotal: number;
  todayReads: number;
  sevenDaysReads: number;
  history: { date: string; value: number }[];
  writesHistory?: { date: string; value: number }[];
  byDatabase?: {
    todayReads: Record<string, number>;
    reads30d: Record<string, number>;
    writes30d: Record<string, number>;
  };
  collections: { products: number; orders: number; inventory: number; categories?: number };
  collectionsTotal?: number;
  documentsTotal?: number;
  lastUpdated: string;
  cached: boolean;
  error?: string;
};

type ReadSourceSummary = {
  bySource: { source: string; count: number; collections: string[]; ops: Record<string, number> }[];
  byCollection: { collectionId: string; count: number; sources: string[]; ops: Record<string, number> }[];
  bySourceFile: { file: string; line: number; count: number; source: string }[];
  byMinute: { minute: string; count: number }[];
  crossRef: { source: string; collection: string; count: number }[];
  recent: { ts: number; op: string; collection: string; source: string; file: string; line: number }[];
  total: number;
  ops: Record<string, number>;
};

/* ─── Helpers ─── */
// Firebase free tier se resetea a medianoche hora del Pacífico (PDT/PST)
// PDT (mar-oct): UTC-7 | PST (nov-feb): UTC-8
function getPacificOffset(): number {
  // Aproximación: DST en US es segundo domingo de marzo → primer domingo de noviembre
  const now = new Date();
  const year = now.getUTCFullYear();
  const march = new Date(Date.UTC(year, 2, 1));
  const nov = new Date(Date.UTC(year, 10, 1));
  // Segundo domingo de marzo
  while (march.getUTCDay() !== 0) march.setUTCDate(march.getUTCDate() + 1);
  march.setUTCDate(march.getUTCDate() + 7);
  // Primer domingo de noviembre
  while (nov.getUTCDay() !== 0) nov.setUTCDate(nov.getUTCDate() + 1);
  const isDST = now >= march && now < nov;
  return isDST ? -7 * 3600 : -8 * 3600; // PDT: -7h, PST: -8h
}

function secondsSinceMidnightPacific(): number {
  const now = new Date();
  const pacificTime = new Date(now.getTime() + getPacificOffset() * 1000);
  return pacificTime.getUTCHours() * 3600 + pacificTime.getUTCMinutes() * 60 + pacificTime.getUTCSeconds();
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmt(n: number) {
  return (n || 0).toLocaleString('es-CL');
}

function compactNum(n: number) {
  return new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
}

function getBarColor(pct: number): string {
  if (pct >= 85) return '#ef4444';
  if (pct >= 50) return '#f59e0b';
  return '#10b981';
}

function getStatusBadge(reads: number) {
  if (reads > 50000) return { label: '🔴 EXCEDIDO', bg: 'bg-red-50 text-red-700 border-red-200', bar: '#ef4444' };
  if (reads > 35000) return { label: '🟡 ALTO', bg: 'bg-amber-50 text-amber-700 border-amber-200', bar: '#f59e0b' };
  if (reads > 10000) return { label: '🟡 MODERADO', bg: 'bg-amber-50 text-amber-700 border-amber-200', bar: '#f59e0b' };
  return { label: '🟢 ÓPTIMO', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: '#10b981' };
}

/* ─── Main Component ─── */
export default function FirebaseMonitorPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [sources, setSources] = useState<ReadSourceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [elapsed, setElapsed] = useState(secondsSinceMidnightPacific());
  const [hoveredDay, setHoveredDay] = useState<{ date: string; reads: number; writes: number } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed(secondsSinceMidnightPacific()), 1000);
    return () => clearInterval(t);
  }, []);

  function showToast(type: 'success' | 'error', text: string) {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const url = force ? '/api/admin/firebase-usage?force=1' : '/api/admin/firebase-usage';
      const [usageRes, sourcesRes] = await Promise.all([
        fetch(url, { cache: 'no-store' }),
        fetch('/api/admin/read-sources', { cache: 'no-store' }),
      ]);
      if (!usageRes.ok) throw new Error(`HTTP ${usageRes.status}`);
      const json = await usageRes.json();
      setData(json);
      if (sourcesRes.ok) {
        setSources(await sourcesRes.json());
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleClearCache() {
    try {
      await fetch('/api/revalidate?tag=products');
      showToast('success', '¡Caché de productos e historia actualizado!');
    } catch {
      showToast('error', 'Error al limpiar caché');
    }
  }

  /* Calculations */
  const history = data?.history || [];
  const writesHistory = data?.writesHistory || [];
  const totalDaySeconds = 86400;
  const dayPct = (elapsed / totalDaySeconds) * 100;

  // Active today's reads
  const effectiveTodayReads = (data?.todayReads && data.todayReads > 0) ? data.todayReads : (sources?.total || 0);
  const todayPct = Math.min(100, (effectiveTodayReads / 50000) * 100);
  const barColor = getBarColor(todayPct);
  const sevenPct = data ? Math.min(100, (data.sevenDaysReads / 350000) * 100) : 0;
  const projectedReads = elapsed > 0 ? Math.round((effectiveTodayReads / elapsed) * totalDaySeconds) : 0;

  // Peak day calculation
  let peakDay = { date: '', value: 0 };
  for (const h of history) {
    if (h.value > peakDay.value) {
      peakDay = { date: h.date, value: h.value };
    }
  }

  // Last 15 days for main chart
  const recentHistory = history.slice(-15);

  return (
    <div className="min-h-[calc(100vh-2rem)] bg-slate-50/50 p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">

        {/* ─── Header ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <Link
              href="/admin/ia"
              className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 hover:shadow-md transition-all text-slate-600 shrink-0"
            >
              <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </Link>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full mb-1">
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-[10px] sm:text-xs font-bold text-indigo-600 uppercase tracking-widest">
                  Backend
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Consumo y Recursos (Free Tier 50K/día)
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClearCache}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Limpiar Caché</span>
            </button>
            <button
              onClick={() => load(true)}
              disabled={refreshing || loading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white border border-transparent hover:bg-indigo-700 rounded-xl text-sm font-bold transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {loading ? (
          /* ─── Skeleton ─── */
          <div className="space-y-6 lg:space-y-8 animate-pulse">
            <div className="h-44 bg-white rounded-3xl border border-slate-100 shadow-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-white rounded-3xl border border-slate-100 shadow-sm" />
              ))}
            </div>
            <div className="h-64 bg-white rounded-3xl border border-slate-100 shadow-sm" />
          </div>
        ) : !data ? (
          /* ─── Error State ─── */
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">No se pudieron cargar los datos</h2>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              Verifica la conexión con el servidor.
            </p>
            <button
              onClick={() => load(true)}
              className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md"
            >
              Reintentar Conexión
            </button>
          </div>
        ) : (
          <div className="space-y-6 lg:space-y-8">

            {/* ─── Top 2 Hero Cards (Cronómetro + Gauge 50K) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">

              {/* Card 1: Cronómetro Diario (Hora Pacífico) */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none group-hover:bg-cyan-50/50 transition-colors duration-1000" />
                <div className="relative">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
                        <Clock className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                          Cronómetro Diario (Pacífico)
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                            {formatDuration(elapsed)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-end justify-between bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100">
                    <div className="flex items-center gap-4 sm:gap-6 w-full">
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proyección hoy</p>
                        <p className={`text-2xl font-black ${projectedReads > 50000 ? 'text-red-500' : 'text-emerald-500'}`}>
                          ~{compactNum(projectedReads)}
                        </p>
                      </div>
                      <div className="w-px h-10 bg-slate-200 hidden sm:block" />
                      <div className="flex-1 text-right">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Día transcurrido (Pacífico)</p>
                        <p className="text-2xl font-black text-indigo-600">{dayPct.toFixed(1)}%</p>
                      </div>
                      <div className="w-2.5 h-12 bg-slate-200 rounded-full overflow-hidden shrink-0">
                        <div
                          className="w-full bg-gradient-to-t from-cyan-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out"
                          style={{ height: `${dayPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Lecturas Hoy vs Límite Free (50K) */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                      Lecturas Hoy vs Límite Free (50K/día)
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-black tracking-tight" style={{ color: barColor }}>
                        {fmt(effectiveTodayReads)}
                      </span>
                      <span className="text-sm font-bold text-slate-400">/ 50,000</span>
                    </div>
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: `${barColor}15`, color: barColor }}
                  >
                    {todayPct >= 85 ? '🔴 CRÍTICO' : todayPct >= 50 ? '🟡 MODERADO' : '🟢 ÓPTIMO'}
                  </div>
                </div>

                <div className="h-4 bg-slate-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all duration-1000 relative overflow-hidden"
                    style={{ width: `${todayPct}%`, backgroundColor: barColor }}
                  >
                    <div
                      className="absolute inset-0 bg-white/20 w-full h-full"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', animation: 'shimmer 2s infinite' }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[10px] font-bold text-slate-300 mb-4">
                  {[0, '12.5k', '25k', '37.5k', '50k'].map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>

                <div className="flex items-center gap-3 bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100">
                  <div
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${barColor}15`, color: barColor }}
                  >
                    {todayPct >= 85 ? <AlertTriangle className="w-4 h-4" /> : <CheckCheck className="w-4 h-4" />}
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">
                    {todayPct >= 85
                      ? 'Atención: Estás cerca del límite de 50K diario. Revisa operaciones activas.'
                      : todayPct >= 50
                      ? 'Consumo moderado. Tienes suficiente margen dentro de los 50K diarios.'
                      : 'Consumo óptimo. Tienes suficiente cuota para el día de hoy.'}
                  </p>
                </div>
              </div>

            </div>

            {/* ─── Desglose Multi-Tenant por Base de Datos ─── */}
            {data.byDatabase && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                        Desglose de Consumo por Base de Datos
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                          Multi-Tenant
                        </span>
                      </h2>
                      <p className="text-xs text-slate-400 font-medium">
                        Llamadas y lecturas separadas individualmente por cada tienda en el proyecto
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Auditoría Google Cloud Monitoring
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Tarjeta Importadora Carlitos */}
                  {(() => {
                    const reads = data.byDatabase?.todayReads?.['donbalato'] || 0;
                    const totalToday = data.todayReads || 1;
                    const pct = Math.min(100, Math.round((reads / totalToday) * 100));
                    const reads30d = data.byDatabase?.reads30d?.['donbalato'] || 0;
                    const writes30d = data.byDatabase?.writes30d?.['donbalato'] || 0;

                    return (
                      <div className="bg-gradient-to-br from-cyan-50/50 via-white to-blue-50/30 rounded-2xl p-5 sm:p-6 border border-cyan-100/80 shadow-sm relative overflow-hidden group">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20">
                              <Store className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900">Importadora Carlitos</h3>
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-800">
                                  Base Activa
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 font-mono">donbalato</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-xl border border-cyan-100">
                            {pct}% de hoy
                          </span>
                        </div>

                        <div className="mb-4">
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-xs font-semibold text-slate-500">Lecturas hoy:</span>
                            <span className="text-2xl font-black text-slate-900 tracking-tight">
                              {fmt(reads)} <span className="text-xs text-slate-400 font-normal">ops</span>
                            </span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full transition-all duration-1000"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-medium text-slate-500 pt-3 border-t border-cyan-100/60">
                          <span>30 días: <strong className="text-slate-700">{compactNum(reads30d)}</strong> lecturas</span>
                          <span><strong className="text-slate-700">{compactNum(writes30d)}</strong> escrituras</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tarjeta Tienda Demo */}
                  {(() => {
                    const reads = data.byDatabase?.todayReads?.['(default)'] || 0;
                    const totalToday = data.todayReads || 1;
                    const pct = Math.min(100, Math.round((reads / totalToday) * 100));
                    const reads30d = data.byDatabase?.reads30d?.['(default)'] || 0;
                    const writes30d = data.byDatabase?.writes30d?.['(default)'] || 0;

                    return (
                      <div className="bg-gradient-to-br from-purple-50/50 via-white to-pink-50/30 rounded-2xl p-5 sm:p-6 border border-purple-100/80 shadow-sm relative overflow-hidden group">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900">Importadora Carlitos</h3>
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                                  Demo Store
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 font-mono">(default)</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-100">
                            {pct}% de hoy
                          </span>
                        </div>

                        <div className="mb-4">
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-xs font-semibold text-slate-500">Lecturas hoy:</span>
                            <span className="text-2xl font-black text-slate-900 tracking-tight">
                              {fmt(reads)} <span className="text-xs text-slate-400 font-normal">ops</span>
                            </span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-500 to-pink-600 rounded-full transition-all duration-1000"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-medium text-slate-500 pt-3 border-t border-purple-100/60">
                          <span>30 días: <strong className="text-slate-700">{compactNum(reads30d)}</strong> lecturas</span>
                          <span><strong className="text-slate-700">{compactNum(writes30d)}</strong> escrituras</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ─── 4 KPI Cards ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {[
                {
                  label: 'Lecturas totales (30d)',
                  value: compactNum(data.databaseReadsTotal),
                  sub: `${fmt(data.databaseReadsTotal)} totales`,
                  icon: Activity,
                  colors: 'from-indigo-500 to-indigo-600',
                  text: 'text-indigo-600',
                  shadow: 'shadow-indigo-500/20',
                },
                {
                  label: 'Escrituras (30d)',
                  value: compactNum(data.databaseWritesTotal),
                  sub: 'Creaciones y updates',
                  icon: Database,
                  colors: 'from-cyan-500 to-cyan-600',
                  text: 'text-cyan-600',
                  shadow: 'shadow-cyan-500/20',
                },
                {
                  label: 'Lecturas semanales',
                  value: compactNum(data.sevenDaysReads),
                  sub: `${sevenPct.toFixed(0)}% de 420k semanal`,
                  icon: TrendingUp,
                  colors: 'from-violet-500 to-violet-600',
                  text: 'text-violet-600',
                  shadow: 'shadow-violet-500/20',
                },
                {
                  label: 'Documentos activos',
                  value: fmt(data.documentsTotal || 0),
                  sub: 'Catálogo y pedidos',
                  icon: Layers,
                  colors: 'from-emerald-500 to-emerald-600',
                  text: 'text-emerald-600',
                  shadow: 'shadow-emerald-500/20',
                },
              ].map((s, i) => (
                <div
                  key={i}
                  className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-transform duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${s.colors} shadow-lg ${s.shadow} flex items-center justify-center text-white`}>
                      <s.icon className="w-6 h-6" />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                      {s.label}
                    </span>
                    <p className={`text-3xl font-black tracking-tight mb-1 ${s.text}`}>{s.value}</p>
                    <p className="text-xs font-medium text-slate-400">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ─── Interactive Daily Chart (Light Theme) ─── */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-black text-slate-900">Gráfico de Lecturas Diarias (Últimos 15 Días)</h2>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Pasa el cursor por las barras para ver lecturas y escrituras exactas.
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> &lt; 15k</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500" /> 15k–50k</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-500" /> &gt; 50k</span>
                </div>
              </div>

              {/* Hover Inspection Bar */}
              <div className="min-h-[40px] bg-slate-50 rounded-2xl px-5 py-2.5 border border-slate-100 flex items-center justify-between text-xs">
                {hoveredDay ? (
                  <>
                    <span className="font-bold text-slate-800">
                      📅 {new Date(hoveredDay.date).toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' })}
                    </span>
                    <div className="flex items-center gap-4 font-extrabold">
                      <span className="text-indigo-600">📖 Lecturas: {fmt(hoveredDay.reads)}</span>
                      <span className="text-cyan-600">✏️ Escrituras: {fmt(hoveredDay.writes)}</span>
                      <span className="text-slate-900">Total: {fmt(hoveredDay.reads + hoveredDay.writes)}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-slate-400 font-medium">Coloca el cursor sobre cualquier barra para inspeccionar fecha y consumo exacto.</span>
                )}
              </div>

              {/* Chart Bars */}
              {recentHistory.length > 0 ? (
                <div className="relative pt-6 pb-2">
                  <div className="flex items-end gap-2 sm:gap-3 h-64 w-full">
                    {recentHistory.map((item, i) => {
                      const writeItem = writesHistory.find(w => w.date === item.date) || { value: 0 };
                      const maxVal = Math.max(...recentHistory.map(h => h.value), 50000);
                      const heightPct = Math.max(5, (item.value / maxVal) * 100);
                      const badge = getStatusBadge(item.value);
                      const dateFormatted = new Date(item.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' });

                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center gap-2 group cursor-pointer h-full justify-end"
                          onMouseEnter={() => setHoveredDay({ date: item.date, reads: item.value, writes: writeItem.value })}
                          onMouseLeave={() => setHoveredDay(null)}
                        >
                          <span className="text-[10px] font-extrabold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                            {compactNum(item.value)}
                          </span>

                          <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden flex items-end h-full p-0.5 border border-slate-200/50">
                            <div
                              className="w-full rounded-t-lg transition-all duration-500 group-hover:brightness-110 shadow-sm"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor: badge.bar,
                              }}
                            />
                          </div>

                          <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-900 transition-colors">
                            {dateFormatted}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                  Sin datos suficientes para graficar
                </div>
              )}
            </div>

            {/* ─── Detailed Daily Breakdown Table ─── */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Desglose Detallado por Día</h2>
                  <p className="text-xs text-slate-400 font-medium">Historial completo de peticiones registradas</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-3 px-3">Fecha</th>
                      <th className="py-3 px-3">Lecturas</th>
                      <th className="py-3 px-3">Escrituras</th>
                      <th className="py-3 px-3">Total Reqs</th>
                      <th className="py-3 px-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...recentHistory].reverse().map((row, i) => {
                      const writeItem = writesHistory.find(w => w.date === row.date) || { value: 0 };
                      const total = row.value + writeItem.value;
                      const badge = getStatusBadge(row.value);
                      const dateStr = new Date(row.date).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });

                      return (
                        <tr key={i} className="hover:bg-slate-50/80 transition-colors font-medium">
                          <td className="py-3 px-3 text-slate-900 font-bold capitalize">
                            {dateStr}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-indigo-600">
                            {fmt(row.value)}
                          </td>
                          <td className="py-3 px-3 font-mono text-cyan-600">
                            {fmt(writeItem.value)}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">
                            {fmt(total)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${badge.bg}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ─── Realtime Sources Breakdown ─── */}
            {sources && sources.bySource.length > 0 && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Top Origen de Lecturas Firebase</h2>
                    <p className="text-xs text-slate-400 font-medium">
                      Rastreadas en memoria en tiempo real ({fmt(sources.total)} lecturas activas)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Por Ruta / Componente</h3>
                    <div className="space-y-3">
                      {sources.bySource.slice(0, 7).map((s, i) => {
                        const max = sources.bySource[0]?.count || 1;
                        const pct = (s.count / max) * 100;
                        return (
                          <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex justify-between items-center mb-1 text-xs">
                              <span className="font-mono text-slate-700 font-bold truncate max-w-[70%]" title={s.source}>{s.source}</span>
                              <span className="font-mono font-black text-rose-600">{fmt(s.count)}</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Por Colección</h3>
                    <div className="space-y-3">
                      {sources.byCollection.slice(0, 7).map((c, i) => {
                        const max = sources.byCollection[0]?.count || 1;
                        const pct = (c.count / max) * 100;
                        return (
                          <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex justify-between items-center mb-1 text-xs">
                              <span className="font-mono text-slate-700 font-bold truncate max-w-[70%]" title={c.collectionId}>{c.collectionId}</span>
                              <span className="font-mono font-black text-indigo-600">{fmt(c.count)}</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm ${toast.type === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-red-500 text-white shadow-red-500/20'}`}>
            {toast.type === 'success' ? <CheckCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {toast.text}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes shimmer { 100% { transform: translateX(100%); } }` }} />
    </div>
  );
}
