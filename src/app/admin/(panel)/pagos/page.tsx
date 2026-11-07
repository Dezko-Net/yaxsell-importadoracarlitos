'use client';

import { useState, useEffect } from 'react';
import { Save, CheckCircle, CreditCard, Copy, Check, DollarSign, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

interface BankDetails {
  bankAccountHolder: string;
  bankRut: string;
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankEmail: string;
  bankInstructions: string;
  minimumPurchase: string;
}

const DEFAULT: BankDetails = {
  bankAccountHolder: '',
  bankRut: '',
  bankName: '',
  bankAccountType: '',
  bankAccountNumber: '',
  bankEmail: '',
  bankInstructions: 'Transfiere el monto exacto del pedido y sube el comprobante para confirmar tu orden.',
  minimumPurchase: '50000',
};

const BANK_TYPES = ['Cuenta Vista', 'Cuenta Corriente', 'Cuenta de Ahorro', 'Cuenta RUT'];

export default function PagosPage() {
  const [form, setForm] = useState<BankDetails>(DEFAULT);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 1. Cargar desde localStorage para disponibilidad instantánea
    try {
      const stored = localStorage.getItem('store_bank_details');
      if (stored) setForm({ ...DEFAULT, ...JSON.parse(stored) });
    } catch {}

    // 2. Sincronizar desde la base de datos Firestore
    fetch('/api/store-settings')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setForm(prev => {
            const updated = {
              ...prev,
              bankAccountHolder: data.bankAccountHolder || prev.bankAccountHolder,
              bankRut: data.bankRut || prev.bankRut,
              bankName: data.bankName || prev.bankName,
              bankAccountType: data.bankAccountType || prev.bankAccountType,
              bankAccountNumber: data.bankAccountNumber || prev.bankAccountNumber,
              bankEmail: data.bankEmail || data.email || prev.bankEmail,
              bankInstructions: data.bankInstructions || prev.bankInstructions,
              minimumPurchase: data.minimumPurchase ? String(data.minimumPurchase) : prev.minimumPurchase,
            };
            try { localStorage.setItem('store_bank_details', JSON.stringify(updated)); } catch {}
            return updated;
          });
        }
      })
      .catch(err => console.error('Error fetching settings in pagos:', err));
  }, []);

  function set(key: keyof BankDetails, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    // Guardar en localStorage inmediatamente
    try {
      localStorage.setItem('store_bank_details', JSON.stringify(form));
    } catch {}

    // Guardar en base de datos Firestore a través de la API
    try {
      const res = await fetch('/api/store-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountHolder: form.bankAccountHolder,
          bankRut: form.bankRut,
          bankName: form.bankName,
          bankAccountType: form.bankAccountType,
          bankAccountNumber: form.bankAccountNumber,
          bankEmail: form.bankEmail,
          bankInstructions: form.bankInstructions,
          minimumPurchase: Number(form.minimumPurchase) || 50000,
          MINIMUM_PURCHASE: Number(form.minimumPurchase) || 50000,
        }),
      });

      if (res.ok) {
        setSaved(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('store-settings-updated'));
        }
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert('Error al guardar en el servidor');
      }
    } catch (err) {
      console.error('Error saving pagos settings to server:', err);
      alert('Error de conexión al guardar configuración');
    } finally {
      setSaving(false);
    }
  }

  function copyAll() {
    const text = [
      `Titular: ${form.bankAccountHolder}`,
      `RUT: ${form.bankRut}`,
      `Banco: ${form.bankName}`,
      `Tipo: ${form.bankAccountType}`,
      `N° cuenta: ${form.bankAccountNumber}`,
      `Email: ${form.bankEmail}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide';

  return (
    <div className="max-w-[900px] mx-auto space-y-6 pb-12">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Pagos</h1>
            <p className="text-sm text-gray-400">Configuración de métodos de pago para checkout</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyAll} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 font-medium transition shadow-sm">
            {copied ? <><Check className="w-4 h-4 text-emerald-500" />Copiado</> : <><Copy className="w-4 h-4" />Copiar datos</>}
          </button>
          <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition shadow-sm ${saved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'} ${saving ? 'opacity-75 cursor-wait' : ''}`}>
            {saved ? <><CheckCircle className="w-4 h-4" />Guardado</> : saving ? <><RefreshCw className="w-4 h-4 animate-spin" />Guardando...</> : <><Save className="w-4 h-4" />Guardar</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Transferencia bancaria */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Transferencia Bancaria</p>
                  <p className="text-xs text-gray-400">Único método de pago activo actualmente</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                Activo
              </span>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>Titular de la cuenta *</label>
                  <input value={form.bankAccountHolder} onChange={e => set('bankAccountHolder', e.target.value)}
                    className={inp} placeholder="Nombre completo o razón social" />
                </div>
                <div>
                  <label className={lbl}>RUT del titular *</label>
                  <input value={form.bankRut} onChange={e => set('bankRut', e.target.value)}
                    className={inp} placeholder="12.345.678-9" />
                </div>
                <div>
                  <label className={lbl}>Banco *</label>
                  <input value={form.bankName} onChange={e => set('bankName', e.target.value)}
                    className={inp} placeholder="Ej: Banco Estado, Santander..." />
                </div>
                <div>
                  <label className={lbl}>Tipo de cuenta *</label>
                  <select value={form.bankAccountType} onChange={e => set('bankAccountType', e.target.value)} className={inp}>
                    {BANK_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Número de cuenta *</label>
                  <input value={form.bankAccountNumber} onChange={e => set('bankAccountNumber', e.target.value)}
                    className={inp} placeholder="0000000000" />
                </div>
                <div>
                  <label className={lbl}>Email de notificación</label>
                  <input type="email" value={form.bankEmail} onChange={e => set('bankEmail', e.target.value)}
                    className={inp} placeholder="pagos@tutienda.cl" />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className={lbl}>Instrucciones para el cliente</label>
                  <textarea value={form.bankInstructions} onChange={e => set('bankInstructions', e.target.value)}
                    className={`${inp} resize-none`} rows={3}
                    placeholder="Instrucciones adicionales que verá el cliente en la página de confirmación..." />
                </div>
              </div>
            </div>
          </div>

          {/* Mínimo de compra */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Restricciones de Compra</p>
                <p className="text-xs text-gray-400">Monto mínimo para procesar un pedido</p>
              </div>
            </div>
            
            <div className="p-6">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className={lbl}>Monto mínimo (CLP)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">$</span>
                    <input type="number" min="0" value={form.minimumPurchase} onChange={e => set('minimumPurchase', e.target.value)}
                      className={`${inp} pl-7`} placeholder="50000" />
                  </div>
                </div>
                <div className="w-full sm:w-auto p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    {Number(form.minimumPurchase) > 0
                      ? <>Mínimo activo: <strong className="text-indigo-600">${Number(form.minimumPurchase).toLocaleString('es-CL')}</strong></>
                      : <span className="text-amber-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Sin monto mínimo</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar / Preview */}
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-800">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-gray-400" />
              <p className="font-semibold text-white text-sm">Vista Previa Cliente</p>
            </div>
            <div className="p-6 space-y-3">
              {[
                { label: 'Titular', value: form.bankAccountHolder || '—' },
                { label: 'RUT', value: form.bankRut || '—' },
                { label: 'Banco', value: form.bankName || '—' },
                { label: 'Tipo de cuenta', value: form.bankAccountType },
                { label: 'N° de cuenta', value: form.bankAccountNumber || '—' },
                { label: 'Email', value: form.bankEmail || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5 border-b border-gray-800 pb-2 last:border-0 last:pb-0">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
                  <span className="text-sm text-gray-200 font-mono">{value}</span>
                </div>
              ))}
              
              {form.bankInstructions && (
                <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <p className="text-xs text-indigo-300 leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    {form.bankInstructions}
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center px-4">
            Los datos se guardan en este navegador (localStorage). Para sincronizar entre dispositivos, debes configurarlos en cada uno.
          </p>
        </div>

      </div>
    </div>
  );
}
