'use client';

import { useState, useEffect } from 'react';
import { Settings, Check, Loader, AlertTriangle, Eye, EyeOff } from 'lucide-react';

interface Config {
  endpoint: string;
  projectId: string;
  databaseId: string;
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  bankRut: string;
  bankEmail: string;
  storeName: string;
}

const DEFAULTS: Config = {
  endpoint: '',
  projectId: '',
  databaseId: '',
  bankName: 'Banco de Chile',
  bankAccountType: 'Cuenta Corriente',
  bankAccountNumber: '4081220201',
  bankAccountHolder: 'Importadora Carlitos',
  bankRut: '78267426-9',
  bankEmail: '',
  storeName: 'Tienda',
};

export default function ConfigurarPage() {
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showIds, setShowIds] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('appwrite_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        setConfig(prev => ({ ...prev, ...parsed }));
      }
      const bankStored = localStorage.getItem('store_bank_details');
      if (bankStored) {
        const parsed = JSON.parse(bankStored);
        setConfig(prev => ({ ...prev, ...parsed }));
      }
      const nameStored = localStorage.getItem('store_name');
      if (nameStored) setConfig(prev => ({ ...prev, storeName: nameStored }));
    } catch {}
  }, []);

  function set(key: keyof Config, val: string) {
    setConfig(f => ({ ...f, [key]: val }));
  }

  function handleSave() {
    localStorage.setItem('appwrite_config', JSON.stringify({
      endpoint: config.endpoint,
      projectId: config.projectId,
      databaseId: config.databaseId,
    }));
    localStorage.setItem('store_bank_details', JSON.stringify({
      bankName: config.bankName,
      bankAccountType: config.bankAccountType,
      bankAccountNumber: config.bankAccountNumber,
      bankAccountHolder: config.bankAccountHolder,
      bankRut: config.bankRut,
      bankEmail: config.bankEmail,
    }));
    localStorage.setItem('store_name', config.storeName);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    window.location.reload();
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const { Client, Databases } = await import('@/lib/firebase-compat');
      const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
      const db = new Databases(client);
      await db.listDocuments(config.databaseId, 'products', []);
      setTestResult({ ok: true, msg: '✓ Conexión exitosa. Colecciones accesibles.' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
        setTestResult({ ok: false, msg: '✗ Error CORS — Ve a Appwrite Console → tu proyecto → Settings → Platforms → Add Web App con hostname: localhost' });
      } else if (msg.includes('401') || msg.includes('missing scope')) {
        setTestResult({ ok: true, msg: '✓ Conexión OK (colecciones sin permiso público — normal si requieren auth).' });
      } else if (msg.includes('404') || msg.includes('not found')) {
        setTestResult({ ok: false, msg: `✗ Colección 'products' no encontrada. Verifica el Database ID.` });
      } else {
        setTestResult({ ok: false, msg: `✗ ${msg}` });
      }
    } finally { setTesting(false); }
  }

  const inputCls = 'w-full bg-white/5 border border-white/12 text-white rounded-xl px-4 py-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none transition-all placeholder-white/20';

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 glass rounded-xl flex items-center justify-center">
          <Settings size={20} className="text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Configuración de la tienda</h1>
          <p className="text-sm text-white/40">Configura las credenciales de Appwrite y datos del negocio</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Store name */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-4 text-sm text-white/70 uppercase tracking-wider">Nombre de la tienda</h2>
          <input value={config.storeName} onChange={e => set('storeName', e.target.value)}
            placeholder="Mi Tienda" className={inputCls} />
        </div>

        {/* Appwrite config */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-white/70 uppercase tracking-wider">Appwrite</h2>
            <button onClick={() => setShowIds(!showIds)} className="text-xs text-white/40 hover:text-white flex items-center gap-1 transition-colors">
              {showIds ? <><EyeOff size={12}/> Ocultar</> : <><Eye size={12}/> Mostrar</>}
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Endpoint</label>
              <input value={config.endpoint} onChange={e => set('endpoint', e.target.value)}
                placeholder="https://nyc.cloud.appwrite.io/v1" className={inputCls}
                type={showIds ? 'text' : 'password'} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Project ID</label>
              <input value={config.projectId} onChange={e => set('projectId', e.target.value)}
                placeholder="xxxxxxxxxxxxxxx" className={inputCls}
                type={showIds ? 'text' : 'password'} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Database ID</label>
              <input value={config.databaseId} onChange={e => set('databaseId', e.target.value)}
                placeholder="xxxxxxxxxxxxxxx" className={inputCls}
                type={showIds ? 'text' : 'password'} />
            </div>
          </div>
          <button onClick={handleTest} disabled={!config.endpoint || !config.projectId || !config.databaseId || testing}
            className="mt-4 glass px-4 py-2 rounded-xl text-sm hover:bg-white/10 disabled:opacity-40 flex items-center gap-2 transition-colors">
            {testing ? <><Loader size={14} className="animate-spin" /> Probando...</> : 'Probar conexión'}
          </button>
          {testResult && (
            <div className={`mt-3 p-3 rounded-xl text-sm flex items-start gap-2 ${testResult.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {testResult.ok ? <Check size={14} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />}
              {testResult.msg}
            </div>
          )}
        </div>

        {/* Bank details */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold text-sm text-white/70 uppercase tracking-wider mb-4">Datos bancarios para transferencia</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Banco</label>
              <input value={config.bankName} onChange={e => set('bankName', e.target.value)} placeholder="Mercado Pago" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Tipo de cuenta</label>
              <input value={config.bankAccountType} onChange={e => set('bankAccountType', e.target.value)} placeholder="Cuenta Vista" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Número de cuenta</label>
              <input value={config.bankAccountNumber} onChange={e => set('bankAccountNumber', e.target.value)} placeholder="123456789" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Titular</label>
              <input value={config.bankAccountHolder} onChange={e => set('bankAccountHolder', e.target.value)} placeholder="Nombre Apellido" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">RUT del titular</label>
              <input value={config.bankRut} onChange={e => set('bankRut', e.target.value)} placeholder="12.345.678-9" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Email de contacto</label>
              <input type="email" value={config.bankEmail} onChange={e => set('bankEmail', e.target.value)} placeholder="pagos@tienda.cl" className={inputCls} />
            </div>
          </div>
        </div>

        <button onClick={handleSave}
          className={`w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all ${saved ? 'bg-green-600 text-white' : 'gradient-bg hover:opacity-90 text-white'}`}>
          {saved ? <><Check size={18}/> Configuración guardada</> : <><Settings size={18}/> Guardar configuración</>}
        </button>
        <p className="text-xs text-center text-white/30">La configuración se guarda localmente en este navegador</p>
      </div>
    </div>
  );
}
