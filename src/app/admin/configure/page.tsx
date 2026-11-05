'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseConfig, saveFirebaseConfig, FirebaseConfig } from '@/lib/db';
import { Settings, Save, CheckCircle, AlertTriangle, Database, Globe, Key, ArrowLeft, RefreshCw } from 'lucide-react';

export default function ConfigurePage() {
  const [config, setConfig] = useState<FirebaseConfig>({ endpoint: '', projectId: '', databaseId: '' });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    setConfig(getFirebaseConfig());
  }, []);

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

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { Client, Account } = await import('@/lib/firebase-compat');
      const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
      const account = new Account(client);
      await account.get();
      setTestResult({ ok: true, message: 'Conexión exitosa. Sesión activa detectada.' });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('missing scope') || msg.includes('AppwriteException')) {
        setTestResult({ ok: true, message: 'Conexión exitosa con Appwrite (sin sesión activa, es normal).' });
      } else {
        setTestResult({ ok: false, message: `Error de conexión: ${msg}` });
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg mb-4">
            <Settings className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Configurar Appwrite</h1>
          <p className="text-gray-500 mt-1 text-sm">Ingresa las credenciales de tu instancia Appwrite</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-7 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Endpoint</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={config.endpoint}
                onChange={e => setConfig(c => ({ ...c, endpoint: e.target.value }))}
                placeholder="https://cloud.appwrite.io/v1"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
            </div>
            <p className="text-xs text-gray-400 mt-1">Ej: https://fra.cloud.appwrite.io/v1</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Project ID</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={config.projectId}
                onChange={e => setConfig(c => ({ ...c, projectId: e.target.value }))}
                placeholder="mi-proyecto-id"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Database ID</label>
            <div className="relative">
              <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={config.databaseId}
                onChange={e => setConfig(c => ({ ...c, databaseId: e.target.value }))}
                placeholder="67f1dc940037b3d367bb"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
            </div>
          </div>

          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {testResult.ok
                ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              {testResult.message}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={handleTest} disabled={testing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              {testing ? 'Probando...' : 'Probar conexión'}
            </button>
            <button onClick={handleSave}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
              {saved ? <><CheckCircle className="w-4 h-4" />Guardado</> : <><Save className="w-4 h-4" />Guardar</>}
            </button>
          </div>
        </div>

        <div className="mt-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">O configura con variables de entorno</p>
          <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 overflow-x-auto">{`NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=tu-project-id
NEXT_PUBLIC_APPWRITE_DATABASE_ID=tu-database-id`}</pre>
        </div>

        <div className="mt-5 flex justify-center gap-4">
          <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
            <ArrowLeft className="w-3.5 h-3.5" />Volver
          </button>
          <button onClick={() => router.replace('/admin/login')} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition">
            Ir al login →
          </button>
        </div>
      </div>
    </div>
  );
}
