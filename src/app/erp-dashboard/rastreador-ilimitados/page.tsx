'use client';

import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Save, Package, AlertTriangle, CheckCircle2, Search, X } from 'lucide-react';

interface IlimitadoItem {
  id: string;
  sku: string;
  nombre: string;
  stockActual: number;
  imageUrl: string;
  categoria: string;
  vendidoHoy: number;
}

export default function RastreadorIlimitadosPage() {
  const [products, setProducts] = useState<IlimitadoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fecha, setFecha] = useState('');
  const [search, setSearch] = useState('');
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/erp/ilimitados-tracker');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      setProducts(data.products || []);
      setFecha(data.fecha || '');
    } catch (e: any) {
      setError(e?.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase().trim();
    return products.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q)
    );
  }, [products, search]);

  const vendidosHoy = useMemo(() => products.filter(p => p.vendidoHoy > 0), [products]);
  const totalVendido = useMemo(() => products.reduce((s, p) => s + p.vendidoHoy, 0), [products]);

  const handleStockChange = (id: string, value: string) => {
    setStockInputs(prev => ({ ...prev, [id]: value.replace(/[^0-9]/g, '') }));
  };

  const handleSaveAll = async () => {
    const updates: Array<{ id: string; stock: number }> = [];
    for (const [id, val] of Object.entries(stockInputs)) {
      const stock = Number(val);
      if (!isNaN(stock) && stock >= 0) {
        updates.push({ id, stock });
      }
    }
    if (updates.length === 0) {
      setError('No hay stocks para actualizar');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/erp/ilimitados-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      setSavedMsg(`✅ ${data.updated} producto(s) actualizados con stock real.`);
      setStockInputs({});
      setTimeout(() => setSavedMsg(''), 5000);
      load();
    } catch (e: any) {
      setError(e?.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const pendientesGuardar = Object.values(stockInputs).filter(v => v !== '' && !isNaN(Number(v))).length;

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              <Package className="text-amber-500" size={28} />
              Rastreador de Ilimitados
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Productos en venta sin stock. Al cierre, ingresa el stock real y el sistema calcula la diferencia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            {pendientesGuardar > 0 && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
              >
                <Save size={16} className={saving ? 'animate-spin' : ''} />
                Guardar ({pendientesGuardar})
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-[10px] font-bold uppercase text-amber-600">Ilimitados</div>
            <div className="text-2xl font-black text-amber-700">{products.length}</div>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
            <div className="text-[10px] font-bold uppercase text-rose-600">Vendidos hoy</div>
            <div className="text-2xl font-black text-rose-700">{vendidosHoy.length}</div>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
            <div className="text-[10px] font-bold uppercase text-indigo-600">Unidades vendidas</div>
            <div className="text-2xl font-black text-indigo-700">{totalVendido}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">Fecha</div>
            <div className="text-lg font-black text-slate-700">{fecha || '—'}</div>
          </div>
        </div>

        {/* Mensajes */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 font-medium flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {savedMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 font-medium flex items-center gap-2">
            <CheckCircle2 size={16} /> {savedMsg}
          </div>
        )}

        {/* Buscador */}
        <div className="relative">
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
            placeholder="Buscar por nombre, SKU o categoría..."
            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold px-1">
              ✕
            </button>
          )}
        </div>

        {/* Tabla / Lista */}
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <RefreshCw className="mx-auto h-8 w-8 mb-2 animate-spin opacity-40" />
            <p className="font-semibold">Cargando productos ilimitados...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Package className="mx-auto h-10 w-10 mb-2 opacity-40" />
            <p className="font-semibold">{products.length === 0 ? 'No hay productos ilimitados' : 'No se encontraron resultados'}</p>
            {products.length === 0 && (
              <p className="text-xs mt-1">Los productos con stock ilimitado aparecerán aquí automáticamente.</p>
            )}
          </div>
        ) : (
          <>
            {/* Desktop: tabla */}
            <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr className="text-xs tracking-wider">
                    <th className="p-4 text-center w-16">Foto</th>
                    <th className="p-4">Producto</th>
                    <th className="p-4 text-center w-24">Vendido hoy</th>
                    <th className="p-4 text-center w-32">Stock real (ingresar)</th>
                    <th className="p-4 text-center w-32">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((p) => {
                    const inputVal = stockInputs[p.id] ?? '';
                    const stockReal = inputVal !== '' ? Number(inputVal) : null;
                    const diferencia = stockReal !== null ? stockReal - p.vendidoHoy : null;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 text-center">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.nombre} className="h-12 w-12 rounded-lg object-cover border border-slate-200" loading="lazy" />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 mx-auto">
                              <Package size={20} />
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800 leading-tight">{p.nombre}</div>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[11px] text-indigo-500 font-bold">{p.sku}</span>
                            {p.categoria && (
                              <span className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 font-medium">{p.categoria}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {p.vendidoHoy > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 font-black text-base">
                              {p.vendidoHoy}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">0</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={inputVal}
                            onChange={(e) => handleStockChange(p.id, e.target.value)}
                            placeholder="—"
                            className="w-24 text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          />
                        </td>
                        <td className="p-4 text-center">
                          {diferencia !== null ? (
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-lg font-black text-sm ${
                              diferencia < 0 ? 'bg-rose-100 text-rose-700' :
                              diferencia === 0 ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {diferencia > 0 ? '+' : ''}{diferencia}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: tarjetas */}
            <div className="sm:hidden space-y-3">
              {filtered.map((p) => {
                const inputVal = stockInputs[p.id] ?? '';
                const stockReal = inputVal !== '' ? Number(inputVal) : null;
                const diferencia = stockReal !== null ? stockReal - p.vendidoHoy : null;
                return (
                  <div key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-start gap-3 p-3">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.nombre} className="h-14 w-14 rounded-lg object-cover border border-slate-200 shrink-0" loading="lazy" />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-slate-50 border border-slate-100 grid place-content-center text-slate-300 shrink-0">
                          <Package size={20} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 text-sm leading-tight truncate">{p.nombre}</div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] text-indigo-500 font-bold">{p.sku}</span>
                          {p.categoria && (
                            <span className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 font-medium">{p.categoria}</span>
                          )}
                        </div>
                      </div>
                      {p.vendidoHoy > 0 && (
                        <div className="shrink-0 text-center">
                          <div className="text-[9px] font-bold uppercase text-rose-500">Vendido</div>
                          <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 font-black text-base">
                            {p.vendidoHoy}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50/70 border-t border-slate-100">
                      <div className="flex-1">
                        <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">Stock real</div>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={inputVal}
                          onChange={(e) => handleStockChange(p.id, e.target.value)}
                          placeholder="Ingresar stock..."
                          className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                      </div>
                      {diferencia !== null && (
                        <div className="text-center shrink-0">
                          <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">Diferencia</div>
                          <span className={`inline-flex items-center px-2.5 py-1.5 rounded-lg font-black text-sm ${
                            diferencia < 0 ? 'bg-rose-100 text-rose-700' :
                            diferencia === 0 ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {diferencia > 0 ? '+' : ''}{diferencia}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botón guardar flotante en móvil */}
            {pendientesGuardar > 0 && (
              <div className="sm:hidden sticky bottom-3 z-10">
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition shadow-lg disabled:opacity-50"
                >
                  <Save size={18} className={saving ? 'animate-spin' : ''} />
                  Guardar {pendientesGuardar} stock(s) real(es)
                </button>
              </div>
            )}
          </>
        )}

        {/* Instrucciones */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={16} className="text-amber-500" />
            Cómo usar el rastreador
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm">
            <li>Los productos marcados como <strong>ilimitado</strong> (stock 99999) aparecen aquí automáticamente.</li>
            <li>La columna <strong>Vendido hoy</strong> muestra cuántas unidades se vendieron en el POS hoy.</li>
            <li>Al cierre (18:00), ingresa el <strong>stock real</strong> que physically queda en la tienda.</li>
            <li>La <strong>diferencia</strong> = stock real − vendido hoy. Si es negativa, faltan unidades.</li>
            <li>Presiona <strong>Guardar</strong> para actualizar el stock en la base de datos.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
