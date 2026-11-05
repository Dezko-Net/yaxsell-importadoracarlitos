'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig,
  exportFirebaseConfig, FirebaseConfig, getServices,
} from '@/lib/db';
import {
  Save, CheckCircle, AlertTriangle, Database, Globe, Key, RefreshCw,
  XCircle, HardDrive, Copy, Trash2, Megaphone, Wrench, Server, Zap, Activity,
  ExternalLink, Shield, Wifi, WifiOff,
} from 'lucide-react';

/* ─────────── Announcement Bar Config ─────────── */
function AnnouncementConfig() {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [bg, setBg] = useState('linear-gradient(90deg, #6366f1, #8b5cf6)');
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('announcement_config');
      if (stored) {
        const c = JSON.parse(stored);
        setText(c.text || ''); setLink(c.link || ''); setBg(c.bg || ''); setEnabled(c.enabled !== false);
      }
    } catch {}
  }, []);

  function save() {
    localStorage.setItem('announcement_config', JSON.stringify({ text, link, bg, color: '#fff', enabled }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-gray-50 focus:bg-white transition';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white">
        <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
          <Megaphone className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">Barra de Anuncio</p>
          <p className="text-xs text-gray-400">Texto promocional en la parte superior de la tienda</p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Texto del anuncio</label>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="🔥 Envío gratis en compras sobre $30.000" className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Link (opcional)</label>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="/productos" className={inp} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Fondo CSS</label>
            <input value={bg} onChange={e => setBg(e.target.value)} placeholder="linear-gradient(...)" className={inp} />
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
          <div
            onClick={() => setEnabled(!enabled)}
            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? 'bg-violet-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${enabled ? 'left-5' : 'left-1'}`} />
          </div>
          <span className="text-sm text-gray-700 font-medium">Mostrar barra de anuncio</span>
        </label>
        <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition shadow-sm">
          {saved ? <><CheckCircle className="w-4 h-4" />Guardado</> : <><Save className="w-4 h-4" />Guardar</>}
        </button>
      </div>
    </div>
  );
}

/* ─────────── Maintenance Mode Config ─────────── */
function MaintenanceConfig() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('Estamos realizando mejoras. Volveremos pronto.');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('maintenance_config');
      if (stored) {
        const c = JSON.parse(stored);
        setEnabled(c.enabled || false);
        setMessage(c.message || 'Estamos realizando mejoras. Volveremos pronto.');
      }
    } catch {}
  }, []);

  function save() {
    localStorage.setItem('maintenance_config', JSON.stringify({ enabled, message }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${enabled ? 'border-amber-200' : 'border-gray-100'}`}>
      <div className={`flex items-center gap-3 px-6 py-4 border-b ${enabled ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${enabled ? 'bg-amber-100' : 'bg-gray-100'}`}>
          <Wrench className={`w-4 h-4 ${enabled ? 'text-amber-600' : 'text-gray-500'}`} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">Modo Mantenimiento</p>
          <p className="text-xs text-gray-400">Bloquea el acceso a la tienda para visitantes</p>
        </div>
        {enabled && (
          <span className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-full uppercase animate-pulse">
            Activo
          </span>
        )}
      </div>
      <div className="p-6 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setEnabled(!enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? 'bg-amber-500' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${enabled ? 'left-6' : 'left-1'}`} />
          </div>
          <span className="text-sm text-gray-700 font-medium">Habilitar modo mantenimiento</span>
        </label>
        {enabled && (
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Mensaje a mostrar</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-none bg-amber-50"
            />
          </div>
        )}
        <button
          onClick={save}
          className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-xl transition shadow-sm ${enabled ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-500 hover:bg-gray-600'}`}
        >
          {saved ? <><CheckCircle className="w-4 h-4" />Guardado</> : <><Save className="w-4 h-4" />Guardar</>}
        </button>
      </div>
    </div>
  );
}

/* ─────────── Constants ─────────── */
const EXPECTED_COLLECTIONS = [
  'products', 'categories', 'subcategories', 'banners', 'orders', 'users',
  'notifications', 'timed_offers', 'live_streams', 'support_tickets',
  'sequences', 'fcm_tokens', 'order_status_history', 'wholesale_requests',
  'discount_coupons', 'stock_requests', 'stock_alerts', 'inventory_products', 'catalog_products',
];
const EXPECTED_BUCKETS = ['products', 'banners', 'categories-icons', 'comprobantes', 'live-thumbnails'];

/* ─────────── Main Page ─────────── */
export default function SettingsPage() {
  const [config, setConfig] = useState<FirebaseConfig>({ endpoint: '', projectId: '', databaseId: '' });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [checkingCols, setCheckingCols] = useState(false);
  const [colResults, setColResults] = useState<Record<string, 'ok' | 'missing' | 'error'> | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [checkingBuckets, setCheckingBuckets] = useState(false);
  const [bucketResults, setBucketResults] = useState<Record<string, 'ok' | 'missing' | 'error'> | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => { setConfig(getFirebaseConfig()); }, []);

  const handleSave = () => {
    if (!config.endpoint || !config.projectId || !config.databaseId) {
      alert('Todos los campos son requeridos');
      return;
    }
    saveFirebaseConfig(config);
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 3000);
  };

  const checkCollections = useCallback(async () => {
    setCheckingCols(true);
    setColResults(null);
    const results: Record<string, 'ok' | 'missing' | 'error'> = {};
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      for (const col of EXPECTED_COLLECTIONS) {
        try {
          await databases.listDocuments(databaseId, col, []);
          results[col] = 'ok';
        } catch (e: any) {
          results[col] = e?.message?.includes('not found') || e?.code === 404 ? 'missing' : 'error';
        }
        setColResults({ ...results });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: 'Error: ' + e.message });
    } finally {
      setCheckingCols(false);
    }
  }, []);

  const checkBuckets = useCallback(async () => {
    setCheckingBuckets(true);
    setBucketResults(null);
    const results: Record<string, 'ok' | 'missing' | 'error'> = {};
    try {
      const { storage } = getServices();
      for (const id of EXPECTED_BUCKETS) {
        try {
          await storage.listFiles(id, []);
          results[id] = 'ok';
        } catch (e: any) {
          results[id] = e?.code === 404 || e?.message?.includes('not found') ? 'missing' : 'error';
        }
        setBucketResults({ ...results });
      }
    } catch { setBucketResults({}); }
    finally { setCheckingBuckets(false); }
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setLatencyMs(null);
    const t0 = Date.now();
    try {
      const { Client, Account } = await import('@/lib/firebase-compat');
      const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
      const account = new Account(client);
      await account.get();
      const ms = Date.now() - t0;
      setLatencyMs(ms); setPingMs(ms); setIsOnline(true);
      setLatencyHistory(prev => [...prev.slice(-11), ms]);
      setTestResult({ ok: true, message: 'Conexión exitosa. Sesión activa detectada.' });
    } catch (e: any) {
      const ms = Date.now() - t0;
      setLatencyMs(ms); setPingMs(ms);
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('missing scope')) {
        setIsOnline(true);
        setLatencyHistory(prev => [...prev.slice(-11), ms]);
        setTestResult({ ok: true, message: 'Appwrite accesible (sin sesión activa — normal en admin).' });
      } else {
        setIsOnline(false);
        setTestResult({ ok: false, message: `Error de conexión: ${msg}` });
      }
    } finally { setTesting(false); }
  };

  const inp = 'w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono bg-gray-50 focus:bg-white transition';
  const okCols = colResults ? Object.values(colResults).filter(v => v === 'ok').length : 0;
  const okBuckets = bucketResults ? Object.values(bucketResults).filter(v => v === 'ok').length : 0;
  const latColor = (ms: number) => ms < 300 ? '#10b981' : ms < 800 ? '#f59e0b' : '#ef4444';
  const latLabel = (ms: number) => ms < 300 ? 'Excelente' : ms < 800 ? 'Normal' : 'Lento';

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6" style={{ overflowY: 'auto', height: '100%', minHeight: '100%' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Servidor</h1>
            <p className="text-sm text-gray-400">Configuración técnica · Appwrite · Diagnóstico</p>
          </div>
        </div>
        <a
          href="https://cloud.appwrite.io/console"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition shadow-sm"
        >
          <ExternalLink className="w-4 h-4" />
          Consola Appwrite
        </a>
      </div>

      {/* ── Status Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Estado',
            value: isOnline === null ? 'Sin verificar' : isOnline ? 'Online' : 'Offline',
            icon: isOnline === null
              ? <Wifi className="w-5 h-5 text-gray-400" />
              : isOnline ? <Wifi className="w-5 h-5 text-emerald-500" /> : <WifiOff className="w-5 h-5 text-red-500" />,
            bg: isOnline === null ? 'bg-gray-50 border-gray-200' : isOnline ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
            tc: isOnline === null ? 'text-gray-600' : isOnline ? 'text-emerald-700' : 'text-red-700',
          },
          {
            label: 'Latencia',
            value: pingMs !== null ? `${pingMs}ms` : '—',
            icon: <Zap className="w-5 h-5" style={{ color: pingMs !== null ? latColor(pingMs) : '#9ca3af' }} />,
            bg: pingMs !== null
              ? pingMs < 300 ? 'bg-emerald-50 border-emerald-200' : pingMs < 800 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200',
            tc: pingMs !== null
              ? pingMs < 300 ? 'text-emerald-700' : pingMs < 800 ? 'text-amber-700' : 'text-red-700'
              : 'text-gray-500',
          },
          {
            label: 'Colecciones',
            value: colResults ? `${okCols}/${EXPECTED_COLLECTIONS.length}` : '—',
            icon: <Database className="w-5 h-5 text-indigo-500" />,
            bg: colResults ? (okCols === EXPECTED_COLLECTIONS.length ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200') : 'bg-gray-50 border-gray-200',
            tc: colResults ? (okCols === EXPECTED_COLLECTIONS.length ? 'text-emerald-700' : 'text-amber-700') : 'text-gray-500',
          },
          {
            label: 'Buckets',
            value: bucketResults ? `${okBuckets}/${EXPECTED_BUCKETS.length}` : '—',
            icon: <HardDrive className="w-5 h-5 text-violet-500" />,
            bg: bucketResults ? (okBuckets === EXPECTED_BUCKETS.length ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200') : 'bg-gray-50 border-gray-200',
            tc: bucketResults ? (okBuckets === EXPECTED_BUCKETS.length ? 'text-emerald-700' : 'text-amber-700') : 'text-gray-500',
          },
        ].map(card => (
          <div key={card.label} className={`flex items-center gap-3 p-4 rounded-2xl border ${card.bg}`}>
            {card.icon}
            <div>
              <p className={`text-lg font-bold ${card.tc}`}>{card.value}</p>
              <p className="text-xs text-gray-400">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT */}
        <div className="space-y-6">

          {/* Appwrite Credentials */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Database className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Credenciales Appwrite</p>
                <p className="text-xs text-gray-400">Configuración de conexión al backend</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {([
                { label: 'Endpoint',    field: 'endpoint'   as keyof FirebaseConfig, placeholder: 'https://nyc.cloud.appwrite.io/v1', Icon: Globe,    hint: 'URL base de tu instancia Appwrite' },
                { label: 'Project ID',  field: 'projectId'  as keyof FirebaseConfig, placeholder: 'mi-proyecto-id',                   Icon: Key,      hint: 'ID del proyecto en la consola' },
                { label: 'Database ID', field: 'databaseId' as keyof FirebaseConfig, placeholder: '67f1dc94...',                       Icon: Database, hint: 'ID de la base de datos' },
              ]).map(({ label, field, placeholder, Icon, hint }) => (
                <div key={String(field)}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
                  <div className="relative">
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={config[field]}
                      onChange={e => setConfig(c => ({ ...c, [field]: e.target.value }))}
                      placeholder={placeholder}
                      className={inp}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{hint}</p>
                </div>
              ))}

              {testResult && (
                <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  {testResult.ok ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span className="flex-1 text-xs">{testResult.message}</span>
                  {latencyMs !== null && (
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-lg shrink-0 font-bold ${latencyMs < 400 ? 'bg-emerald-200 text-emerald-900' : latencyMs < 1000 ? 'bg-amber-200 text-amber-900' : 'bg-red-200 text-red-900'}`}>
                      {latencyMs}ms
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1 flex-wrap">
                <button onClick={handleTest} disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
                  <Activity className={`w-4 h-4 ${testing ? 'animate-pulse' : ''}`} />
                  {testing ? 'Probando...' : 'Probar'}
                </button>
                <button onClick={handleSave}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {saved ? <><CheckCircle className="w-4 h-4" />Guardado</> : <><Save className="w-4 h-4" />Guardar</>}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(exportFirebaseConfig()); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
                  title="Copiar config JSON"
                >
                  {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { if (confirm('¿Limpiar la configuración guardada?')) { clearFirebaseConfig(); setConfig(getFirebaseConfig()); } }}
                  className="p-2 rounded-xl border border-gray-200 text-red-400 hover:bg-red-50 transition"
                  title="Resetear configuración"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Latency Monitor */}
          {latencyHistory.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-indigo-500" />
                <p className="font-semibold text-gray-900 text-sm">Monitor de Latencia</p>
                {pingMs !== null && (
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: latColor(pingMs) + '22', color: latColor(pingMs) }}>
                    {latLabel(pingMs)}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-1.5 h-16 mb-3">
                {latencyHistory.map((ms, i) => {
                  const maxMs = Math.max(...latencyHistory, 1);
                  const h = Math.max(Math.round((ms / maxMs) * 56), 6);
                  return (
                    <div
                      key={i}
                      title={`${ms}ms`}
                      className="flex-1 rounded-t cursor-default transition-all"
                      style={{ height: `${h}px`, backgroundColor: latColor(ms), opacity: i === latencyHistory.length - 1 ? 1 : 0.45 }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-400 font-mono">
                <span>Min: {Math.min(...latencyHistory)}ms</span>
                <span>Avg: {Math.round(latencyHistory.reduce((s, v) => s + v, 0) / latencyHistory.length)}ms</span>
                <span>Max: {Math.max(...latencyHistory)}ms</span>
              </div>
            </div>
          )}

          {/* Env vars dark card */}
          <div className="bg-gray-950 rounded-2xl p-6 border border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-gray-500" />
              <p className="font-semibold text-gray-300 text-sm">Variables de Entorno</p>
            </div>
            <p className="text-xs text-gray-600 mb-3">Configuración permanente en <code className="text-indigo-400">.env.local</code>:</p>
            <pre className="text-xs text-emerald-400 font-mono leading-relaxed whitespace-pre-wrap break-all">
{`NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=tu-project-id
NEXT_PUBLIC_APPWRITE_DATABASE_ID=tu-database-id`}
            </pre>
            <p className="text-[10px] text-gray-700 mt-3">Las env vars tienen prioridad sobre localStorage si no hay config guardada en el navegador.</p>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">

          {/* Collections */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Database className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Colecciones</p>
                  <p className="text-xs text-gray-400">
                    {colResults ? `${okCols}/${EXPECTED_COLLECTIONS.length} encontradas` : 'Sin verificar'}
                  </p>
                </div>
              </div>
              <button
                onClick={checkCollections}
                disabled={checkingCols}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingCols ? 'animate-spin' : ''}`} />
                {checkingCols ? 'Verificando...' : 'Verificar'}
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-1.5">
                {EXPECTED_COLLECTIONS.map(col => {
                  const status = colResults?.[col];
                  return (
                    <div key={col} className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-mono transition ${
                      status === 'ok'      ? 'bg-emerald-50 text-emerald-700' :
                      status === 'missing' ? 'bg-red-50 text-red-700' :
                      status === 'error'   ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-50 text-gray-500'
                    }`}>
                      {status === 'ok'      ? <CheckCircle className="w-3 h-3 shrink-0" /> :
                       status === 'missing' ? <XCircle className="w-3 h-3 shrink-0" /> :
                       status === 'error'   ? <AlertTriangle className="w-3 h-3 shrink-0" /> :
                       <div className="w-3 h-3 rounded-full border border-gray-300 shrink-0" />}
                      <span className="truncate">{col}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Storage Buckets */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Storage Buckets</p>
                  <p className="text-xs text-gray-400">
                    {bucketResults ? `${okBuckets}/${EXPECTED_BUCKETS.length} accesibles` : 'Sin verificar'}
                  </p>
                </div>
              </div>
              <button
                onClick={checkBuckets}
                disabled={checkingBuckets}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingBuckets ? 'animate-spin' : ''}`} />
                {checkingBuckets ? 'Verificando...' : 'Verificar'}
              </button>
            </div>
            <div className="p-4 space-y-1.5">
              {EXPECTED_BUCKETS.map(id => {
                const status = bucketResults?.[id];
                return (
                  <div key={id} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs transition ${
                    status === 'ok'      ? 'bg-emerald-50 text-emerald-700' :
                    status === 'missing' ? 'bg-red-50 text-red-700' :
                    status === 'error'   ? 'bg-amber-50 text-amber-700' :
                    'bg-gray-50 text-gray-500'
                  }`}>
                    {status === 'ok'      ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> :
                     status === 'missing' ? <XCircle className="w-3.5 h-3.5 shrink-0" /> :
                     status === 'error'   ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> :
                     <div className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />}
                    <span className="font-mono font-semibold flex-1">{id}</span>
                    {status === 'ok'      && <span className="text-[10px] text-emerald-600">✓ OK</span>}
                    {status === 'missing' && <span className="text-[10px] text-red-500">No encontrado</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Diagnostics */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Diagnóstico Rápido</p>
                <p className="text-xs text-gray-400">Probar conexión + verificar todo de una vez</p>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={async () => { await handleTest(); await checkCollections(); await checkBuckets(); }}
                disabled={testing || checkingCols || checkingBuckets}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${(testing || checkingCols || checkingBuckets) ? 'animate-spin' : ''}`} />
                {(testing || checkingCols || checkingBuckets) ? 'Verificando todo...' : 'Verificar Todo'}
              </button>
              <a
                href={`https://cloud.appwrite.io/console/project-${config.projectId}/overview/usage`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition"
              >
                <ExternalLink className="w-4 h-4" />
                Ver uso y cuotas en Appwrite
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Store-level configs ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnnouncementConfig />
        <MaintenanceConfig />
      </div>
    </div>
  );
}
