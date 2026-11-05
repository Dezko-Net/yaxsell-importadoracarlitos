'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  Bug,
  CheckCheck,
  ChevronRight,
  Eraser,
  Loader2,
  MessageCircle,
  Phone,
  PlayCircle,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
  Settings2,
  ToggleLeft,
  ToggleRight,
  FileText,
  Users,
  Activity,
} from 'lucide-react';

type KeniaConfig = {
  adminPrompt: string;
  customerPrompt: string;
  adminAlertPhone: string;
  tokenLimitPerCustomer: number;
  smartNotifications: boolean;
  messageThresholdForPause: number;
  updatedAt: string;
  isEnabled: boolean;
  debugMode?: boolean;
};

type ThreadStats = {
  totalThreads: number;
  customerThreads: number;
  unreadThreads: number;
  blockedThreads: number;
  overLimitThreads: number;
  totalTokens: number;
};

const emptyConfig: KeniaConfig = {
  adminPrompt: '',
  customerPrompt: '',
  adminAlertPhone: '',
  tokenLimitPerCustomer: 15000,
  smartNotifications: true,
  messageThresholdForPause: 10,
  updatedAt: '',
  isEnabled: true,
};

function formatDate(value: string) {
  if (!value) return 'Sin cambios';
  try {
    return new Date(value).toLocaleString('es-CL', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Santiago',
    });
  } catch { return value; }
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export default function AdminIAPage() {
  const [stats, setStats] = useState<ThreadStats>({
    totalThreads: 0,
    customerThreads: 0,
    unreadThreads: 0,
    blockedThreads: 0,
    overLimitThreads: 0,
    totalTokens: 0,
  });
  const [config, setConfig] = useState<KeniaConfig>(emptyConfig);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [promptTab, setPromptTab] = useState<'customer' | 'admin'>('customer');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ messageCount: number; welcomeShown: boolean; blocked: boolean } | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/admin/ia/config', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) setConfig(data.config);
    } finally { setLoadingConfig(false); }
  }, []);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await fetch('/api/admin/ia/threads', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) setStats(data.stats);
    } finally { setLoadingThreads(false); }
  }, []);

  const loadDebugInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ia/debug', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) {
        setDebugMode(data.debugMode || false);
        setDebugInfo({
          messageCount: data.usage?.messageCount || 0,
          welcomeShown: data.usage?.welcomeShown || false,
          blocked: data.usage?.blocked || false,
        });
      }
    } catch {}
  }, []);

  async function handleDebugAction(action: string) {
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const res = await fetch('/api/admin/ia/debug', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data?.success) {
        if (action === 'toggleDebug') {
          setDebugMode(data.debugMode);
          showToast('success', data.debugMode ? 'Modo depuración activado' : 'Modo depuración desactivado');
        } else if (action === 'resetUser') {
          showToast('success', 'Usuario 56992139185 reseteado');
        } else if (action === 'simulateRegisterClick') {
          setDebugResult(data.message || '');
        }
        await loadDebugInfo();
      } else {
        showToast('error', data?.error || 'Error');
      }
    } catch {
      showToast('error', 'Error de conexion');
    } finally { setDebugLoading(false); }
  }

  useEffect(() => {
    loadConfig();
    loadThreads();
    loadDebugInfo();
  }, [loadConfig, loadThreads, loadDebugInfo]);

  function showToast(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(null), 2800);
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/admin/ia/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'No se pudo guardar');
      setConfig(data.config);
      showToast('success', 'Configuracion guardada');
    } catch (error: any) {
      showToast('error', error?.message || 'Error al guardar');
    } finally { setSavingConfig(false); }
  }

  async function toggleKenia() {
    const next = { ...config, isEnabled: !config.isEnabled };
    setConfig(next);
    try {
      const res = await fetch('/api/admin/ia/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (data?.success) {
        setConfig(data.config);
        showToast('success', data.config.isEnabled ? 'IA activada ✅' : 'IA desactivada ⏸️');
      } else {
        setConfig(config);
        showToast('error', 'No se pudo cambiar el estado');
      }
    } catch {
      setConfig(config);
      showToast('error', 'Error de conexion');
    }
  }

  const isLoading = loadingThreads || loadingConfig;

  return (
    <div style={{ minHeight: '100%', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', padding: '20px 16px 40px' }}>
      <style>{`
        .ia-card { background: #fff; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(15,23,42,0.06); }
        .ia-card-dark { background: #0f172a; border-radius: 20px; border: 1px solid rgba(255,255,255,0.07); }
        .ia-btn-primary { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff; border:none; border-radius:12px; padding:11px 20px; font-size:14px; font-weight:700; cursor:pointer; transition:opacity .15s; }
        .ia-btn-primary:hover { opacity:0.9; }
        .ia-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
        .ia-btn-ghost { display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid #e2e8f0; border-radius:10px; padding:8px 14px; font-size:13px; font-weight:600; color:#475569; cursor:pointer; transition:all .15s; }
        .ia-btn-ghost:hover { border-color:#c7d2fe; color:#4f46e5; background:#eef2ff; }
        .ia-input { width:100%; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 14px; font-size:13.5px; color:#1e293b; outline:none; transition:border-color .15s; box-sizing:border-box; }
        .ia-input:focus { border-color:#818cf8; background:#fff; }
        .ia-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#94a3b8; margin-bottom:6px; display:block; }
        .ia-tab { padding:7px 14px; border-radius:9px; font-size:13px; font-weight:600; border:none; cursor:pointer; transition:all .15s; }
        .ia-tab-active { background:#fff; color:#4f46e5; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
        .ia-tab-inactive { background:transparent; color:#64748b; }
        .ia-stat-card { background:#fff; border-radius:16px; border:1px solid #e2e8f0; padding:16px; }
        .ia-section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:#94a3b8; margin-bottom:14px; display:flex; align-items:center; gap:6px; }
        @media (max-width: 768px) {
          .ia-main-grid { grid-template-columns: 1fr !important; }
          .ia-stats-grid { grid-template-columns: repeat(2,1fr) !important; }
          .ia-config-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .ia-stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2ff', borderRadius: 20, padding: '4px 12px', marginBottom: 8 }}>
              <Sparkles style={{ width: 13, height: 13, color: '#6366f1' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>Centro de control</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              IA
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
              Configuración global, prompts y visión del sistema
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="ia-btn-ghost" onClick={() => { loadThreads(); loadConfig(); }} disabled={isLoading}>
              <RefreshCw style={{ width: 14, height: 14, ...(isLoading ? { animation: 'spin 1s linear infinite' } : {}) }} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <Link href="/admin/ia/whatsapp" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#25d366', color: '#fff', borderRadius: 12, padding: '9px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'opacity .15s', boxShadow: '0 4px 14px rgba(37,211,102,0.35)' }}>
              <Phone style={{ width: 14, height: 14 }} />
              Abrir WhatsApp
            </Link>
          </div>
        </div>

        {/* ═══ BALATIN STATUS HERO ═══ */}
        <div className="ia-card" style={{ marginBottom: 20, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, borderLeft: `4px solid ${config.isEnabled ? '#22c55e' : '#ef4444'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src="https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/09/1789051062597-pegada-1789051061671.png" alt="Importadora Carlitos" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Importadora Carlitos</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: config.isEnabled ? '#dcfce7' : '#fee2e2', color: config.isEnabled ? '#16a34a' : '#dc2626' }}>
                  {config.isEnabled ? '● ACTIVA' : '● PAUSADA'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                {config.isEnabled
                  ? 'Respondiendo conversaciones de WhatsApp en tiempo real'
                  : 'En modo mantenimiento — no responde a clientes'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Ultima edicion</p>
              <p style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>{formatDate(config.updatedAt)}</p>
            </div>
            <button onClick={toggleKenia} disabled={loadingConfig}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all .15s',
                background: config.isEnabled ? '#fee2e2' : '#dcfce7', color: config.isEnabled ? '#dc2626' : '#16a34a' }}>
              {config.isEnabled
                ? <><ToggleRight style={{ width: 16, height: 16 }} /> Desactivar</>
                : <><ToggleLeft style={{ width: 16, height: 16 }} /> Activar</>}
            </button>
          </div>
        </div>

        {/* ═══ STATS ROW ═══ */}
        <div className="ia-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Conversaciones', value: stats.totalThreads, sub: `${stats.customerThreads} clientes`, icon: MessageCircle, grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)', glow: 'rgba(99,102,241,0.2)' },
            { label: 'Sin leer', value: stats.unreadThreads, sub: 'esperando revision', icon: AlertTriangle, grad: 'linear-gradient(135deg,#f59e0b,#ef4444)', glow: 'rgba(245,158,11,0.2)' },
            { label: 'Bloqueados', value: stats.blockedThreads, sub: `${stats.overLimitThreads} al limite`, icon: Shield, grad: 'linear-gradient(135deg,#ef4444,#ec4899)', glow: 'rgba(239,68,68,0.2)' },
            { label: 'Tokens totales', value: compactNumber(stats.totalTokens), sub: 'consumo acumulado', icon: Zap, grad: 'linear-gradient(135deg,#10b981,#06b6d4)', glow: 'rgba(16,185,129,0.2)' },
          ].map((s) => (
            <div key={s.label} className="ia-stat-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: s.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 14px ${s.glow}` }}>
                <s.icon style={{ width: 20, height: 20, color: '#fff' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>{s.label}</p>
                <p style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ MAIN GRID ═══ */}
        <div className="ia-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>

          {/* LEFT — Config global */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Prompt editor */}
            <div className="ia-card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <p className="ia-section-title"><FileText style={{ width: 13, height: 13 }} /> Instrucciones de Importadora Carlitos</p>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: -4 }}>Editor de prompts</h3>
                </div>
                <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 12, padding: 3, gap: 2 }}>
                  {(['customer', 'admin'] as const).map(tab => (
                    <button key={tab} onClick={() => setPromptTab(tab)} className={`ia-tab ${promptTab === tab ? 'ia-tab-active' : 'ia-tab-inactive'}`}>
                      {tab === 'customer' ? '👤 Clientes' : '🛡️ Admin'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="ia-label">
                {promptTab === 'customer' ? 'Prompt de ventas y atencion al cliente' : 'Prompt de modo administrador'}
              </label>
              <textarea
                value={promptTab === 'customer' ? config.customerPrompt : config.adminPrompt}
                onChange={e => setConfig(p => ({ ...p, [promptTab === 'customer' ? 'customerPrompt' : 'adminPrompt']: e.target.value }))}
                rows={13}
                className="ia-input"
                style={{ resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                placeholder={promptTab === 'customer'
                  ? 'Escribe aqui las instrucciones para Importadora Carlitos cuando atiende a clientes... Puedes usar {{SITE_URL}} para insertar automaticamente la URL de tu tienda.'
                  : 'Instrucciones para cuando Importadora Carlitos detecta que el mensaje viene del numero admin...'}
              />
              {promptTab === 'customer' && (
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 6px', fontFamily: 'monospace', fontSize: 11 }}>{'{{SITE_URL}}'}</span>
                  se reemplaza automaticamente con la URL publica de tu tienda al enviar.
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
                  {(promptTab === 'customer' ? config.customerPrompt : config.adminPrompt).length} chars
                </span>
                <button className="ia-btn-primary" onClick={handleSaveConfig} disabled={savingConfig || loadingConfig}>
                  {savingConfig ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} /> : <Save style={{ width: 15, height: 15 }} />}
                  Guardar cambios
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT — Settings sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* System params */}
            <div className="ia-card" style={{ padding: '18px 20px' }}>
              <p className="ia-section-title"><Settings2 style={{ width: 13, height: 13 }} /> Parametros del sistema</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="ia-label">Tu numero de WhatsApp (notificaciones)</label>
                  <input
                    value={config.adminAlertPhone}
                    onChange={e => setConfig(p => ({ ...p, adminAlertPhone: e.target.value }))}
                    className="ia-input"
                    placeholder="56912345678"
                  />
                </div>
                <div className="ia-config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="ia-label">Limite de tokens / cliente</label>
                    <input
                      type="number" min={1000} step={500}
                      value={config.tokenLimitPerCustomer}
                      onChange={e => setConfig(p => ({ ...p, tokenLimitPerCustomer: Number(e.target.value || 0) }))}
                      className="ia-input"
                    />
                  </div>
                  <div>
                    <label className="ia-label">Pausar tras N msgs sin resp.</label>
                    <input
                      type="number" min={1} step={1}
                      value={config.messageThresholdForPause}
                      onChange={e => setConfig(p => ({ ...p, messageThresholdForPause: Number(e.target.value || 10) }))}
                      className="ia-input"
                    />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', cursor: 'pointer' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Notificacion inteligente</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Avisa al iniciar, al pausar y cada ~{config.messageThresholdForPause} mensajes</p>
                  </div>
                  <div style={{ position: 'relative', width: 44, height: 24, flexShrink: 0 }}>
                    <input type="checkbox" checked={config.smartNotifications}
                      onChange={e => setConfig(p => ({ ...p, smartNotifications: e.target.checked }))}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                    <div onClick={() => setConfig(p => ({ ...p, smartNotifications: !p.smartNotifications }))}
                      style={{ position: 'absolute', inset: 0, borderRadius: 12, background: config.smartNotifications ? '#4f46e5' : '#cbd5e1', cursor: 'pointer', transition: 'background .2s' }}>
                      <div style={{ position: 'absolute', top: 2, left: config.smartNotifications ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
                    </div>
                  </div>
                </label>
                <button className="ia-btn-primary" onClick={handleSaveConfig} disabled={savingConfig || loadingConfig} style={{ width: '100%' }}>
                  {savingConfig ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} /> : <Save style={{ width: 15, height: 15 }} />}
                  Guardar configuracion
                </button>
              </div>
            </div>

            {/* Prompt lengths */}
            <div className="ia-card" style={{ padding: '18px 20px' }}>
              <p className="ia-section-title"><Activity style={{ width: 13, height: 13 }} /> Estado de prompts</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Prompt clientes', value: config.customerPrompt.length, max: 6000, color: '#6366f1' },
                  { label: 'Prompt admin', value: config.adminPrompt.length, max: 4000, color: '#8b5cf6' },
                ].map(p => (
                  <div key={p.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{p.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.value.toLocaleString('es-CL')} chars</span>
                    </div>
                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.round((p.value / p.max) * 100))}%`, background: p.color, borderRadius: 3, transition: 'width .4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Consumo summary */}
            <div className="ia-card" style={{ padding: '18px 20px' }}>
              <p className="ia-section-title"><TrendingUp style={{ width: 13, height: 13 }} /> Consumo del sistema</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Conversaciones totales', value: stats.totalThreads, icon: MessageCircle },
                  { label: 'Clientes activos', value: stats.customerThreads, icon: Users },
                  { label: 'Chats sin leer', value: stats.unreadThreads, icon: AlertTriangle },
                  { label: 'IA bloqueada en', value: stats.blockedThreads, icon: Shield },
                  { label: 'Tokens acumulados', value: compactNumber(stats.totalTokens), icon: Zap },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <item.icon style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#475569' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ DEPURACION ═══ */}
            <div className="ia-card" style={{ padding: '18px 20px', border: debugMode ? '2px solid #f59e0b' : '1px solid #e2e8f0', background: debugMode ? '#fffbeb' : '#fff' }}>
              <p className="ia-section-title" style={{ color: debugMode ? '#d97706' : '#94a3b8' }}>
                <Bug style={{ width: 13, height: 13 }} /> Depuracion
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: debugMode ? '#fef3c7' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Modo depuracion</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>56992139185 deja de ser admin</p>
                  </div>
                  <div style={{ position: 'relative', width: 44, height: 24, flexShrink: 0 }}>
                    <input type="checkbox" checked={debugMode} onChange={() => handleDebugAction('toggleDebug')} disabled={debugLoading} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                    <div onClick={() => !debugLoading && handleDebugAction('toggleDebug')} style={{ position: 'absolute', inset: 0, borderRadius: 12, background: debugMode ? '#f59e0b' : '#cbd5e1', cursor: debugLoading ? 'not-allowed' : 'pointer', transition: 'background .2s' }}>
                      <div style={{ position: 'absolute', top: 2, left: debugMode ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
                    </div>
                  </div>
                </div>

                {debugInfo && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>Mensajes: {debugInfo.messageCount}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: debugInfo.welcomeShown ? '#dcfce7' : '#f1f5f9', color: debugInfo.welcomeShown ? '#16a34a' : '#475569' }}>
                      {debugInfo.welcomeShown ? 'Bienvenida mostrada' : 'Bienvenida pendiente'}
                    </span>
                    {debugInfo.blocked && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fee2e2', color: '#dc2626' }}>Bloqueado</span>}
                  </div>
                )}

                <button onClick={() => handleDebugAction('resetUser')} disabled={debugLoading}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: debugLoading ? 'not-allowed' : 'pointer', transition: 'all .15s' }}>
                  {debugLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Eraser style={{ width: 14, height: 14 }} />}
                  Resetear 56992139185
                </button>

                <button onClick={() => handleDebugAction('simulateRegisterClick')} disabled={debugLoading}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4f46e5', fontSize: 13, fontWeight: 700, cursor: debugLoading ? 'not-allowed' : 'pointer', transition: 'all .15s' }}>
                  {debugLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <PlayCircle style={{ width: 14, height: 14 }} />}
                  Simular click "Registrate con Importadora Carlitos"
                </button>

                {debugResult && (
                  <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12.5, color: '#166534', lineHeight: 1.5 }}>
                    {debugResult}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 14, fontSize: 14, fontWeight: 700, boxShadow: '0 8px 30px rgba(0,0,0,0.2)', background: message.type === 'success' ? '#059669' : '#dc2626', color: '#fff', whiteSpace: 'nowrap' }}>
            {message.type === 'success' ? <CheckCheck style={{ width: 16, height: 16 }} /> : <AlertTriangle style={{ width: 16, height: 16 }} />}
            {message.text}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
