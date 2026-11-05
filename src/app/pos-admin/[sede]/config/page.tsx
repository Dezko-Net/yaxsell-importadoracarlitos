'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Settings, Save, CheckCircle, AlertCircle, Tag, ToggleLeft, ToggleRight, Loader2, ShoppingBag, UserCheck, Globe, MapPin, Eye, X } from 'lucide-react';
import { DEFAULT_SEDE } from '@/types';
import { db } from '@/lib/firebase';
import { DEFAULT_COMPANY_CONFIG, generateReceiptHTML } from '@/lib/posReceipt';
import { doc, setDoc } from 'firebase/firestore';
import { invalidateErpConfigCache } from '@/lib/posConfig';

type ModoVentaPOS = 'cajera_cobra' | 'jefe_cobra';

export interface PriceListItem {
  campo: string;
  nombre: string;
  activa: boolean;
  esExclusiva: boolean;
}

const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-[#405566] outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';

export default function PosAdminConfigPage() {
  const params = useParams<{ sede: string }>();
  const sedeSlug = ((params?.sede as string) || DEFAULT_SEDE).trim();

  // --- Datos empresa ---
  const [nombreEmpresa, setNombreEmpresa] = useState(DEFAULT_COMPANY_CONFIG.nombreEmpresa || '');
  const [rut, setRut] = useState(DEFAULT_COMPANY_CONFIG.rut || '');
  const [giro, setGiro] = useState(DEFAULT_COMPANY_CONFIG.giro || '');
  const [direccion, setDireccion] = useState(DEFAULT_COMPANY_CONFIG.direccion || '');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [sucursalLinea, setSucursalLinea] = useState(DEFAULT_COMPANY_CONFIG.sucursalLinea || '');
  const [clienteNombre, setClienteNombre] = useState(DEFAULT_COMPANY_CONFIG.clienteNombre || '');
  const [clienteRut, setClienteRut] = useState(DEFAULT_COMPANY_CONFIG.clienteRut || '');
  const [ivaPorcentaje, setIvaPorcentaje] = useState(Number(DEFAULT_COMPANY_CONFIG.ivaPorcentaje ?? 19));
  const [loadingEmpresa, setLoadingEmpresa] = useState(true);
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [tipoVistaPrevia, setTipoVistaPrevia] = useState<'comprobante' | null>(null);

  // --- Modo de venta POS ---
  const [modoVentaGlobal, setModoVentaGlobal] = useState<ModoVentaPOS>('cajera_cobra');
  const [modoVentaSedeOverride, setModoVentaSedeOverride] = useState<ModoVentaPOS | null>(null);
  const [savingModoVenta, setSavingModoVenta] = useState(false);

  // --- Timeout auto-anulación de pre-ventas (minutos) ---
  const [preventaTimeoutMin, setPreventaTimeoutMin] = useState(15);
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [cajerasGestionanCajas, setCajerasGestionanCajas] = useState(true);
  const [savingCajerasGestionanCajas, setSavingCajerasGestionanCajas] = useState(false);

  // --- Listas de precios ---
  const [listas, setListas] = useState<PriceListItem[]>([
    { campo: 'precio_detalle', nombre: 'Efectivo', activa: true, esExclusiva: false },
    { campo: 'precio_mayorista', nombre: 'Embalaje', activa: true, esExclusiva: false },
  ]);
  const [savingPrecios, setSavingPrecios] = useState(false);

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const ejemploComprobanteHtml = useMemo(() => generateReceiptHTML({
    tipoComprobante: 'comprobante',
    ventaId: 'ejemplo-configuracion',
    cajero: 'Cajera de ejemplo',
    sedeNombre: sedeSlug,
    fecha: new Date(),
    items: [
      { nombre: 'Producto de ejemplo', cantidad: 2, precioUnitario: 1500, subtotal: 3000 },
      { nombre: 'Segundo producto', cantidad: 1, precioUnitario: 2500, subtotal: 2500 },
    ],
    subtotal: 5500,
    total: 5500,
    pagos: [{ metodo: 'efectivo', monto: 6000 }],
    metodoPago: 'efectivo',
    efectivoPagado: 6000,
    vuelto: 500,
  }, {
    nombreEmpresa, rut, giro, direccion, telefono, email, sucursalLinea,
    clienteNombre, clienteRut, ivaPorcentaje,
  }, { autoPrint: false }), [sedeSlug, nombreEmpresa, rut, giro, direccion, telefono, email, sucursalLinea, clienteNombre, clienteRut, ivaPorcentaje, tipoVistaPrevia]);

  // Cargar datos empresa desde API server
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin-supreme/load-config', { cache: 'no-store' });
        const json = await res.json();

        if (json.ok && json.data && active) {
          const parsed = JSON.parse(json.data || '{}');
          if (parsed.empresa) {
            const emp = parsed.empresa;
            setNombreEmpresa(typeof emp.nombreEmpresa === 'string' ? emp.nombreEmpresa : DEFAULT_COMPANY_CONFIG.nombreEmpresa || '');
            setRut(typeof emp.rut === 'string' ? emp.rut : DEFAULT_COMPANY_CONFIG.rut || '');
            setGiro(typeof emp.giro === 'string' ? emp.giro : DEFAULT_COMPANY_CONFIG.giro || '');
            setDireccion(typeof emp.direccion === 'string' ? emp.direccion : DEFAULT_COMPANY_CONFIG.direccion || '');
            setTelefono(emp.telefono || '');
            setEmail(emp.email || '');
            setSucursalLinea(typeof emp.sucursalLinea === 'string' ? emp.sucursalLinea : DEFAULT_COMPANY_CONFIG.sucursalLinea || '');
            setClienteNombre(typeof emp.clienteNombre === 'string' ? emp.clienteNombre : DEFAULT_COMPANY_CONFIG.clienteNombre || '');
            setClienteRut(typeof emp.clienteRut === 'string' ? emp.clienteRut : DEFAULT_COMPANY_CONFIG.clienteRut || '');
            setIvaPorcentaje(Number.isFinite(Number(emp.ivaPorcentaje)) ? Number(emp.ivaPorcentaje) : Number(DEFAULT_COMPANY_CONFIG.ivaPorcentaje ?? 19));
            if (emp.modoVentaPOS) setModoVentaGlobal(emp.modoVentaPOS);
            if (emp.preventaTimeoutMin) setPreventaTimeoutMin(emp.preventaTimeoutMin);
            if (typeof emp.cajerasGestionanCajas === 'boolean') setCajerasGestionanCajas(emp.cajerasGestionanCajas);
          }
          if (parsed.listasPrecios && Array.isArray(parsed.listasPrecios)) {
            setListas(parsed.listasPrecios);
          }
          if (parsed.overrides && parsed.overrides[sedeSlug]) {
            setModoVentaSedeOverride(parsed.overrides[sedeSlug].modoVentaPOS || null);
          }
        }
      } catch (err) {
        console.error('Error cargando configuración POS:', err);
      } finally {
        if (active) setLoadingEmpresa(false);
      }
    })();
    return () => { active = false; };
  }, [sedeSlug]);

  const updateConfigInFirebase = async (patch: (current: any) => any) => {
    const resLoad = await fetch('/api/admin-supreme/load-config', { cache: 'no-store' });
    const jsonLoad = await resLoad.json();
    let currentData = {};
    if (jsonLoad.ok && jsonLoad.data) {
      currentData = JSON.parse(jsonLoad.data || '{}');
    }

    const updatedData = patch(currentData);
    const jsonStr = JSON.stringify(updatedData);

    const resSave = await fetch('/api/admin-supreme/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: jsonStr }),
    });

    const jsonSave = await resSave.json();
    if (!jsonSave.ok) {
      throw new Error(jsonSave.error || 'Error guardando configuración en servidor');
    }
    // Invalidar caché SWR para que el POS vea el cambio inmediatamente
    invalidateErpConfigCache();
  };

  const handleSaveEmpresa = async () => {
    setSavingEmpresa(true);
    try {
      await updateConfigInFirebase((curr) => ({
        ...curr,
        empresa: {
          ...(curr.empresa || {}),
          nombreEmpresa,
          rut,
          giro,
          direccion,
          telefono,
          email,
          sucursalLinea,
          clienteNombre,
          clienteRut,
          ivaPorcentaje: Math.max(0, Math.min(100, Number(ivaPorcentaje) || 0)),
          modoVentaPOS: modoVentaGlobal,
          preventaTimeoutMin,
          cajerasGestionanCajas,
        },
      }));
      showToast('ok', 'Datos de empresa guardados en Firebase');
    } catch (e: any) {
      showToast('err', 'Error: ' + (e?.message || String(e)));
    } finally {
      setSavingEmpresa(false);
    }
  };

  const handleSaveTimeout = async () => {
    setSavingTimeout(true);
    try {
      await updateConfigInFirebase((curr) => ({
        ...curr,
        empresa: {
          ...(curr.empresa || {}),
          preventaTimeoutMin: Math.max(1, Math.min(120, Number(preventaTimeoutMin) || 15)),
        },
      }));
      showToast('ok', `Timeout de pre-venta: ${preventaTimeoutMin} min`);
    } catch (e: any) {
      showToast('err', 'Error: ' + (e?.message || String(e)));
    } finally {
      setSavingTimeout(false);
    }
  };

  const handleSaveCajerasGestionanCajas = async () => {
    setSavingCajerasGestionanCajas(true);
    try {
      await updateConfigInFirebase((curr) => ({
        ...curr,
        empresa: { ...(curr.empresa || {}), cajerasGestionanCajas },
      }));
      if (db) await setDoc(doc(db, 'config_pos', 'empresa'), { cajerasGestionanCajas }, { merge: true });
      showToast('ok', cajerasGestionanCajas ? 'Las cajeras pueden cerrar y reabrir sus cajas' : 'El cierre y la reapertura quedan a cargo del administrador');
    } catch (e: any) {
      showToast('err', 'Error: ' + (e?.message || String(e)));
    } finally {
      setSavingCajerasGestionanCajas(false);
    }
  };

  const handleSaveModoVenta = async (modo: ModoVentaPOS, replicarATodas: boolean) => {
    setSavingModoVenta(true);
    try {
      if (replicarATodas) {
        await updateConfigInFirebase((curr) => ({
          ...curr,
          empresa: {
            ...(curr.empresa || {}),
            modoVentaPOS: modo,
          },
          overrides: {
            ...(curr.overrides || {}),
            [sedeSlug]: { modoVentaPOS: null },
          },
        }));
        if (db) {
          await setDoc(doc(db, 'config_pos', 'empresa'), { modoVentaPOS: modo }, { merge: true }).catch(() => {});
          await setDoc(doc(db, 'config_pos', `sede_${sedeSlug}`), { modoVentaPOS: null }, { merge: true }).catch(() => {});
        }
        setModoVentaGlobal(modo);
        setModoVentaSedeOverride(null);
        showToast('ok', 'Modo de cobro aplicado a TODAS las sucursales');
      } else {
        await updateConfigInFirebase((curr) => ({
          ...curr,
          overrides: {
            ...(curr.overrides || {}),
            [sedeSlug]: { modoVentaPOS: modo },
          },
        }));
        if (db) {
          await setDoc(doc(db, 'config_pos', `sede_${sedeSlug}`), { modoVentaPOS: modo }, { merge: true }).catch(() => {});
        }
        setModoVentaSedeOverride(modo);
        showToast('ok', `Modo aplicado únicamente a la sucursal [${sedeSlug}]`);
      }
    } catch (e: any) {
      showToast('err', 'Error: ' + (e?.message || String(e)));
    } finally {
      setSavingModoVenta(false);
    }
  };

  const handleVolverAlGlobal = async () => {
    setSavingModoVenta(true);
    try {
      await updateConfigInFirebase((curr) => ({
        ...curr,
        overrides: {
          ...(curr.overrides || {}),
          [sedeSlug]: { modoVentaPOS: null },
        },
      }));
      if (db) {
        await setDoc(doc(db, 'config_pos', `sede_${sedeSlug}`), { modoVentaPOS: null }, { merge: true }).catch(() => {});
      }
      setModoVentaSedeOverride(null);
      showToast('ok', 'Esta sucursal ahora vuelve al modo global');
    } catch (e: any) {
      showToast('err', 'Error: ' + (e?.message || String(e)));
    } finally {
      setSavingModoVenta(false);
    }
  };

  const modoVentaEfectivo: ModoVentaPOS = modoVentaSedeOverride ?? modoVentaGlobal;

  const handleSavePrecios = async () => {
    setSavingPrecios(true);
    try {
      await updateConfigInFirebase((curr) => ({
        ...curr,
        listasPrecios: listas,
      }));
      showToast('ok', 'Listas de precios actualizadas en Firebase');
    } catch (e: any) {
      showToast('err', 'Error: ' + (e?.message || String(e)));
    } finally {
      setSavingPrecios(false);
    }
  };

  const updateLista = (index: number, field: keyof PriceListItem, value: any) => {
    setListas(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  if (loadingEmpresa) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2 text-teal-600" /> Cargando configuración del POS...
      </div>
    );
  }

  return (
    <div data-pos-page="config" className="w-full min-w-0 space-y-5 px-[3%] pt-5 sm:pt-6 pb-12">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white shadow-sm"><Settings size={21} /></div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Administración · {sedeSlug}</div>
            <h1 className="text-xl font-bold tracking-tight text-[#405566] sm:text-2xl">Configuración general POS</h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">Empresa, caja y listas de precios en un solo lugar.</p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"><MapPin size={14} className="text-emerald-700" /> {sedeSlug}</span>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">

      {/* Datos de la empresa */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 xl:col-span-7">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <Settings size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900 text-sm sm:text-base">Datos de la empresa</div>
            <div className="text-[10px] sm:text-xs text-gray-500">Datos del emisor para comprobantes internos</div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button onClick={() => setTipoVistaPrevia('comprobante')}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 sm:gap-2 sm:px-3">
              <Eye size={15} /> Ver comprobante
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">Nombre empresa</label>
            <input type="text" value={nombreEmpresa} onChange={e => setNombreEmpresa(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">RUT empresa</label>
            <input type="text" value={rut} onChange={e => setRut(e.target.value)} placeholder="76.123.456-7" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">Giro</label>
            <textarea rows={2} value={giro} onChange={e => setGiro(e.target.value)} placeholder="Giro comercial" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">Teléfono</label>
            <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+56 9 1234 5678" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contacto@empresa.cl" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">Dirección</label>
            <textarea rows={2} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección que aparece en el comprobante" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">Sucursal / línea comercial</label>
            <input type="text" value={sucursalLinea} onChange={e => setSucursalLinea(e.target.value)} placeholder="Nombre y dirección de sucursal" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">Nombre predeterminado del cliente</label>
            <input type="text" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Genérico" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">RUT predeterminado del cliente</label>
            <input type="text" value={clienteRut} onChange={e => setClienteRut(e.target.value)} placeholder="66.666.666-6" className={inputCls} />
          </div>
          <div>
            <label className="text-sm text-gray-700 mb-1.5 block font-medium">IVA (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={ivaPorcentaje} onChange={e => setIvaPorcentaje(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button onClick={handleSaveEmpresa} disabled={savingEmpresa}
            className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
            {savingEmpresa ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar datos empresa
          </button>
        </div>
      </div>

      {/* Modo de venta POS */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 xl:col-span-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <ShoppingBag size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm sm:text-base">Modo de cobro del POS</div>
            <div className="text-[10px] sm:text-xs text-gray-500">Define la modalidad de cobro para la sucursal [{sedeSlug}]</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
          <span className="text-gray-500">Modo activo en esta sucursal:</span>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-semibold ${
            modoVentaEfectivo === 'jefe_cobra' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {modoVentaEfectivo === 'jefe_cobra' ? <UserCheck size={12} /> : <ShoppingBag size={12} />}
            {modoVentaEfectivo === 'jefe_cobra' ? 'Jefe cobra (con pre-venta)' : 'Cajera cobra directo'}
          </span>
          {modoVentaSedeOverride !== null ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-100 text-teal-700 font-semibold">
              <MapPin size={12} /> Override en esta sucursal
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold">
              <Globe size={12} /> Heredado del global
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Opción 1: Cajera cobra */}
          <div className={`border-2 rounded-xl p-4 transition ${
            modoVentaEfectivo === 'cajera_cobra' ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}>
            <div className="flex items-start gap-2 mb-2">
              <ShoppingBag size={18} className={modoVentaEfectivo === 'cajera_cobra' ? 'text-emerald-600' : 'text-gray-400'} />
              <div className="flex-1">
                <div className="font-semibold text-gray-900 text-sm">Cajera cobra directo</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Por defecto. La cajera procesa el pago al finalizar la venta y descuenta stock.</div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 mt-3">
              <button
                onClick={() => handleSaveModoVenta('cajera_cobra', true)}
                disabled={savingModoVenta}
                className="text-[11px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 font-semibold flex items-center justify-center gap-1.5"
              >
                <Globe size={12} /> Aplicar a TODAS las sucursales
              </button>
              <button
                onClick={() => handleSaveModoVenta('cajera_cobra', false)}
                disabled={savingModoVenta}
                className="text-[11px] bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 text-emerald-700 rounded-lg px-3 py-1.5 font-semibold flex items-center justify-center gap-1.5"
              >
                <MapPin size={12} /> Solo en esta sucursal
              </button>
            </div>
          </div>

          {/* Opción 2: Jefe cobra */}
          <div className={`border-2 rounded-xl p-4 transition ${
            modoVentaEfectivo === 'jefe_cobra' ? 'border-amber-400 bg-amber-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}>
            <div className="flex items-start gap-2 mb-2">
              <UserCheck size={18} className={modoVentaEfectivo === 'jefe_cobra' ? 'text-amber-600' : 'text-gray-400'} />
              <div className="flex-1">
                <div className="font-semibold text-gray-900 text-sm">Jefe cobra (con pre-venta)</div>
                <div className="text-[11px] text-gray-500 mt-0.5">La cajera arma la venta e imprime una pre-venta. Un usuario JEFE recibe, cobra y genera un comprobante interno.</div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 mt-3">
              <button
                onClick={() => handleSaveModoVenta('jefe_cobra', true)}
                disabled={savingModoVenta}
                className="text-[11px] bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 font-semibold flex items-center justify-center gap-1.5"
              >
                <Globe size={12} /> Aplicar a TODAS las sucursales
              </button>
              <button
                onClick={() => handleSaveModoVenta('jefe_cobra', false)}
                disabled={savingModoVenta}
                className="text-[11px] bg-white border border-amber-300 hover:bg-amber-50 disabled:opacity-50 text-amber-700 rounded-lg px-3 py-1.5 font-semibold flex items-center justify-center gap-1.5"
              >
                <MapPin size={12} /> Solo en esta sucursal
              </button>
            </div>
          </div>
        </div>

        {modoVentaSedeOverride !== null && (
          <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
            <div className="text-xs text-teal-800">
              Esta sucursal tiene un modo personalizado ({modoVentaSedeOverride === 'jefe_cobra' ? 'Jefe cobra' : 'Cajera cobra'}).
            </div>
            <button
              onClick={handleVolverAlGlobal}
              disabled={savingModoVenta}
              className="shrink-0 text-[11px] bg-[#087f73] hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 font-semibold"
            >
              Volver al modo global
            </button>
          </div>
        )}

        {savingModoVenta && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={12} className="animate-spin" /> Guardando en Firebase...
          </div>
        )}
      </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      {/* Permisos de cierre y reapertura */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><UserCheck size={18} /></div>
          <div><div className="font-semibold text-gray-900 text-sm sm:text-base">Permisos de caja</div><div className="text-[10px] sm:text-xs text-gray-500">Preferencia general del cliente para todas sus sucursales.</div></div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setCajerasGestionanCajas(value => !value)} className="flex items-start gap-3 text-left">
            {cajerasGestionanCajas ? <ToggleRight size={32} className="shrink-0 text-emerald-500" /> : <ToggleLeft size={32} className="shrink-0 text-gray-300" />}
            <span><strong className="block text-sm text-gray-900">{cajerasGestionanCajas ? 'Cajeras pueden cerrar y reabrir su caja' : 'Cierre y reapertura solo por administrador'}</strong><span className="mt-0.5 block text-xs text-gray-500">Las excepciones por persona se configuran en Usuarios y roles. Si no hay una excepción, se aplica esta preferencia general.</span></span>
          </button>
          <button onClick={handleSaveCajerasGestionanCajas} disabled={savingCajerasGestionanCajas} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
            {savingCajerasGestionanCajas ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar permiso
          </button>
        </div>
      </div>

      {/* Timeout auto-anulación de pre-ventas */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-100">
            <AlertCircle size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm sm:text-base">Auto-anulación de pre-ventas</div>
            <div className="text-[10px] sm:text-xs text-gray-500">Tiempo límite para que el jefe confirme el pago. Si expira, la pre-venta se anula y el stock vuelve al inventario.</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <label className="text-sm text-gray-700 font-medium shrink-0">Timeout (minutos)</label>
          <input
            type="number"
            min={1}
            max={120}
            value={preventaTimeoutMin}
            onChange={e => setPreventaTimeoutMin(Math.max(1, Math.min(120, Number(e.target.value) || 15)))}
          className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm text-[#405566] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
          <span className="text-xs text-gray-500">
            Recomendado: <button onClick={() => setPreventaTimeoutMin(10)} className="text-rose-600 font-semibold underline">10</button> ·
            <button onClick={() => setPreventaTimeoutMin(15)} className="text-rose-600 font-semibold underline ml-1">15</button> ·
            <button onClick={() => setPreventaTimeoutMin(30)} className="text-rose-600 font-semibold underline ml-1">30</button> min
          </span>
          <button
            onClick={handleSaveTimeout}
            disabled={savingTimeout}
            className="ml-auto flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-800 disabled:opacity-50"
          >
            {savingTimeout ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar timeout
          </button>
        </div>

        <div className="rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-[11px] text-slate-600">
          <strong>Lógica:</strong> Al emitir una pre-venta, el stock se descuenta al instante (igual que venta normal).
          Si el jefe no confirma el pago en {preventaTimeoutMin} min, la pre-venta se anula automáticamente y el stock se devuelve.
          Esto evita que la web muestre stock fantasma y libera productos reservados.
        </div>
      </div>
      </div>

      {/* Listas de Precios */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200">
            <Tag size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm sm:text-base">Listas de Precios del POS</div>
            <div className="text-[10px] sm:text-xs text-gray-500">Configura nombres y activa o desactiva listas.</div>
          </div>
        </div>

        <div className="space-y-4">
          {listas.map((l, i) => (
            <div key={i} className={`rounded-xl border p-4 transition ${l.activa ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <button onClick={() => updateLista(i, 'activa', !l.activa)} className="shrink-0" title={l.activa ? 'Desactivar' : 'Activar'}>
                  {l.activa
                    ? <ToggleRight size={32} className="text-emerald-500" />
                    : <ToggleLeft size={32} className="text-gray-300" />
                  }
                </button>

                <div className="flex-1">
                  <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Nombre de la lista</label>
                  <input
                    type="text"
                    value={l.nombre}
                    onChange={e => updateLista(i, 'nombre', e.target.value)}
                    className="w-full bg-transparent border-b border-gray-200 focus:border-teal-500 outline-none text-sm font-semibold text-gray-900 py-1"
                  />
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] text-gray-400 uppercase font-bold">Campo Base de Datos</div>
                  <div className="text-xs font-mono text-gray-500">{l.campo}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={l.esExclusiva}
                  onChange={e => updateLista(i, 'esExclusiva', e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                />
                <span className="text-xs text-gray-500">
                  Precio exclusivo (no se usa para comparar con costo)
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-gray-400">
            Las listas desactivadas se ocultan de las cajeras pero mantienen sus datos en la base de datos.
          </p>
          <button onClick={handleSavePrecios} disabled={savingPrecios}
            className="flex items-center gap-2 rounded-xl bg-[#087f73] hover:bg-[#06695f] px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition disabled:opacity-50">
            {savingPrecios ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar listas de precio
          </button>
        </div>
      </div>

      {tipoVistaPrevia && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" onClick={() => setTipoVistaPrevia(null)}>
          <style jsx global>{`
            .pos-receipt-preview-scroll { scrollbar-width: none; -ms-overflow-style: none; }
            .pos-receipt-preview-scroll::-webkit-scrollbar { display: none; }
          `}</style>
          <section className="flex max-h-[94vh] w-full max-w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-6">
              <div>
                <h2 className="text-base font-bold text-[#405566] sm:text-lg">Ejemplo de {tipoVistaPrevia}</h2>
                <p className="text-xs text-slate-500">Vista previa con los datos actuales del formulario.</p>
              </div>
              <button onClick={() => setTipoVistaPrevia(null)} aria-label="Cerrar ejemplo" className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-[#405566]">
                <X size={20} />
              </button>
            </header>
            <div className="pos-receipt-preview-scroll min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-4">
              <iframe
                title="Vista previa de comprobante interno"
                srcDoc={ejemploComprobanteHtml}
                sandbox="allow-scripts"
                className="mx-auto h-[82vh] min-h-[480px] w-full max-w-[342px] rounded-lg border border-slate-300 bg-white shadow-lg"
              />
            </div>
            <footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-6">
              Los productos, montos, cajera y número son de muestra. La vista previa no imprime.
            </footer>
          </section>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-semibold z-50 border ${
          toast.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toast.type === 'ok' ? <CheckCircle size={18} className="text-emerald-600" /> : <AlertCircle size={18} className="text-red-600" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
