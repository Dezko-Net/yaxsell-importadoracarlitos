'use client';

import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Package, Search, X, ArrowUp, ArrowDown, Edit3, Calendar, Globe, RotateCcw } from 'lucide-react';

interface StockMovement {
  id: string;
  productId: string;
  sku: string;
  nombre: string;
  tipo: string;
  stockAnterior: number;
  cantidad: number;
  stockNuevo: number;
  fecha: string;
  fechaTs: number;
  fechaHora?: string;
  usuario: string;
  nota?: string;
}

const TIPO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  venta: { label: 'Venta POS', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: ArrowDown },
  venta_web: { label: 'Venta Web', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: Globe },
  cancelacion_web: { label: 'Restitución Web', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', icon: RotateCcw },
  add: { label: 'Añadido', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: ArrowUp },
  resta: { label: 'Restado', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', icon: ArrowDown },
  set: { label: 'Ajuste', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Edit3 },
  edicion: { label: 'Edición', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Edit3 },
};

export default function HistorialStockPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/erp/stock-movements?limit=500');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      setMovements(data.movements || []);
    } catch (e: any) {
      setError(e?.message || 'Error cargando historial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = movements;
    if (filtroTipo) list = list.filter(m => m.tipo === filtroTipo);
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter(m =>
      m.nombre?.toLowerCase().includes(q) ||
      m.sku?.toLowerCase().includes(q) ||
      m.usuario?.toLowerCase().includes(q) ||
      m.nota?.toLowerCase().includes(q)
    );
  }, [movements, search, filtroTipo]);

  // Agrupar por fecha
  const grouped = useMemo(() => {
    const map = new Map<string, StockMovement[]>();
    for (const m of filtered) {
      const key = m.fecha || 'Sin fecha';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              <Package className="text-indigo-500" size={28} />
              Historial de Movimientos de Stock
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Registro de todos los cambios de stock: ajustes, añadidos y ventas.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o usuario..."
              className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition shadow-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold px-1">
                ✕
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFiltroTipo('')}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${filtroTipo === '' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              Todos
            </button>
            {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFiltroTipo(filtroTipo === key ? '' : key)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${filtroTipo === key ? 'bg-indigo-600 text-white border-indigo-600' : `bg-white ${cfg.color} border-slate-200 hover:bg-slate-50`}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 font-medium">
            {error}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <RefreshCw className="mx-auto h-8 w-8 mb-2 animate-spin opacity-40" />
            <p className="font-semibold">Cargando movimientos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Package className="mx-auto h-10 w-10 mb-2 opacity-40" />
            <p className="font-semibold">No hay movimientos registrados</p>
            <p className="text-xs mt-1">Los cambios de stock que hagas en Base de Datos aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([fecha, movs]) => (
              <div key={fecha}>
                {/* Fecha header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Calendar size={14} className="text-slate-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{fecha}</h3>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{movs.length} movimiento(s)</span>
                </div>

                {/* Desktop: tabla */}
                <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                      <tr className="text-xs tracking-wider">
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-center">Tipo</th>
                        <th className="p-3 text-center">Anterior</th>
                        <th className="p-3 text-center">Cambio</th>
                        <th className="p-3 text-center">Nuevo</th>
                        <th className="p-3">Hora</th>
                        <th className="p-3">Usuario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {movs.map((m) => {
                        const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.set;
                        const Icon = cfg.icon;
                        const isPositive = m.cantidad > 0;
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-slate-800 text-sm leading-tight truncate max-w-[200px]">{m.nombre || '—'}</div>
                              <div className="font-mono text-[11px] text-indigo-500 font-bold">{m.sku}</div>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${cfg.bg} ${cfg.color}`}>
                                <Icon size={12} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-600">{m.stockAnterior}</td>
                            <td className="p-3 text-center">
                              <span className={`font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isPositive ? '+' : ''}{m.cantidad}
                              </span>
                            </td>
                            <td className="p-3 text-center font-black text-slate-800">{m.stockNuevo}</td>
                            <td className="p-3 text-xs text-slate-500">{m.fechaHora || new Date(m.fechaTs).toLocaleString('es-CL')}</td>
                            <td className="p-3 text-xs text-slate-600">{m.usuario || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: tarjetas */}
                <div className="sm:hidden space-y-2">
                  {movs.map((m) => {
                    const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.set;
                    const Icon = cfg.icon;
                    const isPositive = m.cantidad > 0;
                    return (
                      <div key={m.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 text-sm leading-tight truncate">{m.nombre || '—'}</div>
                            <div className="font-mono text-[11px] text-indigo-500 font-bold">{m.sku}</div>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${cfg.bg} ${cfg.color}`}>
                            <Icon size={12} />
                            {cfg.label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">Ant: <strong className="text-slate-600">{m.stockAnterior}</strong></span>
                            <span className={`font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>{isPositive ? '+' : ''}{m.cantidad}</span>
                            <span className="text-slate-400">→</span>
                            <span className="font-black text-slate-800">{m.stockNuevo}</span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                          <span>{m.fechaHora || new Date(m.fechaTs).toLocaleString('es-CL')}</span>
                          <span>{m.usuario || '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
