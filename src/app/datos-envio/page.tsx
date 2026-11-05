'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Truck, MapPin, CheckCircle, Package, Clock, ShieldCheck, 
  User, ArrowLeft, AlertTriangle, Box
} from 'lucide-react';
import { CHILE_REGIONES } from '@/types';
import { AgencyLogo } from '@/components/catalogo/AgencyLogos';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { formatPrice } from '@/lib/firebase-compat';

interface AgencyItem {
  id: string;
  name: string;
  color?: string;
  bg?: string;
  desc?: string;
  logo?: string;
  active?: boolean;
}

function DatosEnvioContent() {
  const params = useSearchParams();
  const code = params.get('code') || '';
  const id = params.get('id') || '';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerRut, setCustomerRut] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [region, setRegion] = useState('');
  const [comuna, setComuna] = useState('');
  const [address, setAddress] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [agency, setAgency] = useState('STARKEN');

  // Dynamic agencies loaded from /api/agencies (managed in /admin/agencias)
  const [agenciesList, setAgenciesList] = useState<AgencyItem[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(true);

  const comunas = region ? CHILE_REGIONES[region] || [] : [];

  // Fetch dynamic agencies from /admin/agencias database
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agencies');
        const data = await res.json();
        if (Array.isArray(data.agencies) && data.agencies.length > 0) {
          setAgenciesList(data.agencies);
          setAgency((curr) => {
            if (curr && data.agencies.some((a: AgencyItem) => a.name?.toUpperCase() === curr.toUpperCase())) {
              return curr;
            }
            return data.agencies[0].name;
          });
        }
      } catch (err) {
        console.warn('Error al cargar agencias desde /api/agencies:', err);
      } finally {
        setLoadingAgencies(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!code && !id) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const query = id ? `id=${encodeURIComponent(id)}` : `code=${encodeURIComponent(code)}`;
        const res = await fetch(`/api/catalogo/order?${query}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }

        const o = data.order;
        setOrder(o);

        // Pre-fill fields
        const localSavedName = typeof window !== 'undefined' ? (localStorage.getItem('cart_customer_name') || localStorage.getItem('customerName') || '') : '';
        const initialName = (o.CUSTOMERNAME && o.CUSTOMERNAME !== 'Nombre Cliente' && o.CUSTOMERNAME !== 'Cliente') 
          ? o.CUSTOMERNAME 
          : localSavedName;

        setCustomerName(initialName);
        if (o.CUSTOMERRUT) setCustomerRut(o.CUSTOMERRUT);
        if (o.CUSTOMERPHONE) setCustomerPhone(o.CUSTOMERPHONE);
        if (o.REGION) setRegion(o.REGION);
        if (o.COMUNA) setComuna(o.COMUNA);
        if (o.ADDRESS) setAddress(o.ADDRESS);
        if (o.ADDITIONALINFO) setAdditionalInfo(o.ADDITIONALINFO);
        if (o.SHIPPINGAGENCY) setAgency(o.SHIPPINGAGENCY);
      } catch (e: any) {
        setError(e.message || 'Error al cargar pedido');
      } finally {
        setLoading(false);
      }
    })();
  }, [code, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCode = order?.ORDERCODE || code;
    if (!effectiveCode) {
      setError('No se pudo identificar el código de pedido.');
      return;
    }
    if (!customerName.trim()) {
      setError('Por favor escribe tu nombre completo.');
      return;
    }
    const isRetiro = agency?.toUpperCase() === 'RETIRO EN TIENDA';
    if (!isRetiro && (!region || !comuna || !address.trim())) {
      setError('Por favor completa región, comuna y dirección.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/catalogo/shipping-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order?.$id || id || undefined,
          orderCode: effectiveCode,
          customerName: customerName.trim(),
          customerRut: customerRut.trim(),
          region: isRetiro ? (region || 'Región Metropolitana') : region,
          comuna: isRetiro ? (comuna || 'Estación Central') : comuna,
          address: isRetiro ? (address.trim() || 'Retiro en Tienda: Chacabuco 08, Estación Central, Chile') : address.trim(),
          additionalInfo: isRetiro ? (additionalInfo.trim() || 'Referencia: Al lado de Carnicería El Carnicero (https://maps.app.goo.gl/XYFewki3NjcTRoGr7)') : additionalInfo.trim(),
          shippingAgency: agency,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('cart_customer_name', customerName.trim());
          localStorage.setItem('customerName', customerName.trim());
        } catch {}
      }

      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Error al guardar los datos.');
    } finally {
      setSaving(false);
    }
  };

  // Parse items
  let items: any[] = [];
  try {
    if (order?.ITEMS) {
      items = typeof order.ITEMS === 'string' ? JSON.parse(order.ITEMS) : order.ITEMS;
    }
  } catch {}

  const subtotal = items.reduce((sum, it) => sum + (Number(it.total) || (Number(it.price) * Number(it.qty)) || 0), 0);
  const displayName = customerName.trim() || (order?.CUSTOMERNAME && order.CUSTOMERNAME !== 'Nombre Cliente' ? order.CUSTOMERNAME : 'Cliente');

  if (loading) {
    return (
      <div className="bg-white min-h-screen py-16 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-500">Cargando datos de tu pedido...</p>
      </div>
    );
  }

  if (!code && !id) {
    return (
      <div className="bg-white min-h-screen py-16 px-4 flex items-center justify-center">
        <div className="max-w-md w-full rounded-3xl border border-blue-100 p-8 text-center bg-gradient-to-b from-blue-50/40 to-white shadow-sm">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <Box size={28} />
          </div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-2">Ingresa desde tu pedido</h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Para ingresar tus datos de despacho accede mediante el enlace de WhatsApp o ingresa tu código de pedido.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-2xl text-sm transition shadow-md"
          >
            Volver a Importadora Carlitos
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    const selectedAgencyInfo = agenciesList.find(a => a.name?.toUpperCase() === agency?.toUpperCase());
    const isRetiro = agency?.toUpperCase() === 'RETIRO EN TIENDA';
    return (
      <div className="bg-white min-h-screen py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="rounded-3xl p-8 shadow-[0_8px_30px_rgba(37,99,235,0.08)] border border-green-200 text-center relative overflow-hidden bg-gradient-to-b from-green-50/60 to-white">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mx-auto mb-4 border border-green-200 shadow-[0_6px_20px_rgba(34,197,94,0.15)] text-green-600">
              <CheckCircle size={42} strokeWidth={2.4} />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              ¡Datos de Despacho Registrados!
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              Pedido: <strong className="text-gray-900 font-bold">#{order?.ORDERCODE || code}</strong>
            </p>
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-green-600" />
                Despacho en Preparación
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-4 max-w-lg mx-auto">
              Gracias <strong className="text-gray-900">{displayName}</strong>. Tu pedido ya cuenta con sus datos de envío y está listo para que el equipo de bodega lo embale.
            </p>
          </div>

          {/* Destination Recap Card */}
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40 space-y-3 text-sm text-gray-700">
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-3">
              <MapPin size={18} className="text-blue-600" /> Resumen de Entrega
            </h2>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-150 space-y-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Destinatario</span>
                <span className="font-extrabold text-gray-900 text-base">{customerName}</span>
                {customerRut && <span className="text-xs text-gray-500 ml-2 font-mono">({customerRut})</span>}
              </div>
              <div className="pt-2 border-t border-gray-200/60">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Agencia de Envío</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-bold text-gray-900">{agency}</span>
                  {isRetiro ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100">
                      Gratis
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                      {selectedAgencyInfo?.desc || 'Despacho'}
                    </span>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t border-gray-200/60">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Dirección de Destino</span>
                {isRetiro ? (
                  <div className="space-y-1">
                    <span className="font-semibold text-gray-800 block">
                      Retiro presencial en tienda: Chacabuco 08, Estación Central
                    </span>
                    <span className="text-xs text-emerald-700 block font-medium">
                      Referencia: Al lado de Carnicería El Carnicero
                    </span>
                    <a
                      href="https://maps.app.goo.gl/XYFewki3NjcTRoGr7"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline font-bold hover:text-blue-800 inline-flex items-center gap-1"
                    >
                      🗺️ Ver en Google Maps
                    </a>
                  </div>
                ) : (
                  <span className="font-semibold text-gray-800">
                    {`${address}, ${comuna}, ${region}`}
                  </span>
                )}
                {additionalInfo && <p className="text-xs text-gray-500 mt-1 italic">«{additionalInfo}»</p>}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 text-blue-900 text-xs font-medium flex items-center gap-3">
              <span className="text-2xl shrink-0">📦</span>
              <span>Apenas tu paquete sea entregado en {agency}, recibirás la foto del comprobante y número de seguimiento.</span>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row gap-3">
              {order?.$id && (
                <Link
                  href={`/pedido/${order.$id}`}
                  className="flex-1 text-center py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm transition shadow-md"
                >
                  Ver Estado en Vivo de Mi Pedido
                </Link>
              )}
              <Link
                href="/"
                className="flex-1 text-center py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm transition"
              >
                Volver a la Tienda
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Stepper definition (identically styled as /pedido/[id])
  const steps = [
    { key: 'received',  label: 'Pedido Recibido',   icon: <Clock size={15} /> },
    { key: 'stock',     label: 'Stock Confirmado',  icon: <CheckCircle size={15} /> },
    { key: 'payment',   label: 'Revisando Pago',    icon: <ShieldCheck size={15} /> },
    { key: 'shipping',  label: 'Datos de Envío',    icon: <Truck size={15} /> },
    { key: 'packing',   label: 'Embalado',          icon: <Package size={15} /> },
    { key: 'delivered', label: 'Entregado',         icon: <Truck size={15} /> },
  ];
  // Step 3 is current active (Datos de Envío)
  const currentStepIdx = 3;

  return (
    <div className="bg-white min-h-screen py-6 px-4 sm:px-6 lg:px-8 pb-32">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Top Back Link */}
        <Link
          href="/"
          className="group inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 group-hover:bg-blue-50 border border-gray-200 group-hover:border-blue-200 transition-colors">
            <ArrowLeft size={16} className="text-gray-500 group-hover:text-blue-600 transition-colors" />
          </span>
          Volver a Importadora Carlitos
        </Link>

        {/* Header Success Banner */}
        <div className="rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgba(37,99,235,0.08)] border border-blue-100 text-center relative overflow-hidden bg-gradient-to-b from-blue-50/60 to-white">
          <svg className="absolute -top-10 -right-10 w-40 h-40 text-blue-100/70 pointer-events-none" viewBox="0 0 200 200" fill="currentColor" aria-hidden="true">
            <path d="M42.7,-62.9C54.3,-53.2,62,-39.5,66.8,-24.9C71.6,-10.3,73.4,5.2,69.2,19.2C65,33.1,54.8,45.5,42.1,54.8C29.4,64.1,14.7,70.3,-0.9,71.5C-16.5,72.7,-33,68.9,-45.9,59.5C-58.8,50.1,-68.1,35.1,-71.8,18.9C-75.5,2.7,-73.6,-14.7,-66.1,-28.9C-58.6,-43.1,-45.5,-54.1,-31.6,-63C-17.7,-71.9,-3,-78.7,10.6,-76.1C24.2,-73.5,31.1,-72.6,42.7,-62.9Z" transform="translate(100 100)" />
          </svg>
          <svg className="absolute -bottom-12 -left-12 w-40 h-40 text-sky-100/60 pointer-events-none" viewBox="0 0 200 200" fill="currentColor" aria-hidden="true">
            <path d="M39.5,-58.6C50.6,-51.1,58.7,-39.3,64.4,-25.9C70.1,-12.5,73.4,2.6,69.9,16.1C66.4,29.6,56.1,41.5,43.7,50.9C31.3,60.3,16.7,67.2,0.9,66C-14.9,64.8,-29.8,55.5,-42.3,45.1C-54.8,34.7,-64.9,23.2,-68.4,9.4C-71.9,-4.4,-68.8,-20.5,-60.5,-33.1C-52.2,-45.7,-38.7,-54.8,-24.9,-61.4C-11.1,-68,3,-72.1,15.9,-70C28.8,-67.9,28.4,-66.1,39.5,-58.6Z" transform="translate(100 100)" />
          </svg>

          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-[0_6px_20px_rgba(37,99,235,0.15)]">
              <CheckCircle size={38} className="text-blue-600" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              ¡Stock reservado con éxito!
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              Código: <strong className="text-gray-900 font-bold">{order?.ORDERCODE || code}</strong>
            </p>
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm bg-blue-50 text-blue-800 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                Stock apartado en bodega · Comprobante recibido
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              Hola <strong className="text-gray-900 font-semibold">{displayName}</strong>, ingresa tus datos de entrega para preparar el despacho.
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="border rounded-3xl p-5 md:p-6 flex items-start gap-4 transition-all duration-300 bg-blue-50/80 border-blue-200 text-blue-800">
          <div className="p-3 rounded-2xl bg-white shadow-sm flex-shrink-0 text-blue-500">
            <Truck size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base md:text-lg mb-1">Paso Final: Datos de Envío y Agencia</h3>
            <p className="text-sm leading-relaxed opacity-90">
              Tus productos ya están reservados en tienda. A continuación, indícanos quién recibe y selecciona la agencia de envíos que prefieras.
            </p>
          </div>
        </div>

        {/* Order Timeline (Stepper) */}
        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40">
          {/* Desktop horizontal timeline */}
          <div className="hidden md:flex items-start justify-between relative">
            <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-100 z-0" />
            <div 
              className="absolute top-4 left-6 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600 z-1 transition-all duration-500" 
              style={{ width: `${(currentStepIdx / (steps.length - 1)) * 100}%` }} 
            />
            {steps.map((step, i) => {
              const done = i <= currentStepIdx;
              const active = i === currentStepIdx;
              return (
                <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${done ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-400'} ${active ? 'ring-4 ring-blue-100 scale-110' : ''}`}>
                    {step.icon}
                  </div>
                  <span className={`mt-2 text-[10px] text-center leading-tight max-w-[90px] ${active ? 'font-extrabold text-gray-900' : done ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Mobile vertical timeline */}
          <div className="flex md:hidden flex-col gap-0 relative pl-1">
            {steps.map((step, i) => {
              const done = i <= currentStepIdx;
              const active = i === currentStepIdx;
              const isLast = i === steps.length - 1;
              return (
                <div key={step.key} className="flex gap-3 relative">
                  <div className="flex flex-col items-center shrink-0" style={{ width: 36 }}>
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shrink-0"
                      style={{
                        backgroundColor: active ? '#2563eb' : done ? '#3b82f6' : '#fff',
                        borderColor: active ? '#1d4ed8' : done ? '#3b82f6' : '#e5e7eb',
                        color: active || done ? '#fff' : '#d1d5db',
                        boxShadow: active ? '0 0 0 4px #dbeafe' : 'none',
                        transform: active ? 'scale(1.1)' : 'scale(1)',
                      }}
                    >
                      {done && !active ? <CheckCircle size={18} /> : step.icon}
                    </div>
                    {!isLast && (
                      <div
                        className="w-0.5 flex-1 min-h-[28px] transition-colors"
                        style={{ backgroundColor: i < currentStepIdx ? '#3b82f6' : '#e5e7eb' }}
                      />
                    )}
                  </div>
                  <div className={`flex-1 pb-4 ${isLast ? 'pb-0' : ''}`}>
                    <div
                      className="px-3.5 py-2 rounded-2xl border transition-all"
                      style={{
                        backgroundColor: active ? '#eff6ff' : done ? '#f9fafb' : 'transparent',
                        borderColor: active ? '#bfdbfe' : done ? '#f3f4f6' : 'transparent',
                      }}
                    >
                      <span
                        className="text-[13px] block font-bold"
                        style={{ color: active ? '#1d4ed8' : done ? '#374151' : '#9ca3af' }}
                      >
                        {step.label}
                      </span>
                      {active && (
                        <span className="text-[10px] mt-0.5 block font-semibold text-blue-600 flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                          Ingresa tus datos aquí
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Items Breakdown */}
        {items.length > 0 && (
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40">
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-4">
              <Package size={18} className="text-blue-600" /> Detalle de productos reservados
            </h2>
            <div className="divide-y divide-blue-50/40 space-y-3 pb-4">
              {items.map((item, i) => (
                <div key={i} className="pt-3 first:pt-0">
                  <div className="flex gap-3 items-start">
                    <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-blue-100/30 overflow-hidden shrink-0 flex items-center justify-center">
                      {item.img ? (
                        <img src={resolveStorageImageUrl(item.img)} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package size={20} className="text-gray-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 leading-tight">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-400">
                          Cantidad: <strong className="text-gray-800 font-bold">{item.qty}</strong> · {formatPrice(item.price)} c/u
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-extrabold text-gray-900 shrink-0 pt-0.5">
                      {formatPrice(item.total || (item.price * item.qty))}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4 flex flex-col gap-2 text-sm text-gray-500">
              <div className="flex justify-between">
                <span>Subtotal ({items.reduce((s, it) => s + (Number(it.qty) || 0), 0)} unidades)</span>
                <span className="font-semibold text-gray-800">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Envío</span>
                <span className="font-bold text-orange-600">Por pagar (contraentrega)</span>
              </div>
              <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-1">
                ℹ️ El costo del flete se cancela directamente a la agencia de transportes al retirar o recibir.
              </div>
              <div className="flex justify-between text-base font-extrabold text-gray-950 pt-3 border-t border-gray-150 mt-2">
                <span>Total productos</span>
                <span>{formatPrice(order?.TOTAL || subtotal)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Shipping Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-4 rounded-2xl flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Agency Selector with dynamic agencies from /admin/agencias */}
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <Truck size={18} className="text-blue-600" /> Elige tu Agencia de Envío *
              </h2>
              <span className="text-[11px] font-bold text-gray-400">
                {agenciesList.length} opciones disponibles
              </span>
            </div>

            {loadingAgencies ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400 font-medium">Cargando agencias de despacho...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agenciesList.map((ag: AgencyItem) => {
                  const selected = agency?.toUpperCase() === ag.name?.toUpperCase();
                  const isRetiro = ag.name?.toUpperCase() === 'RETIRO EN TIENDA';
                  return (
                    <button
                      key={ag.id || ag.name}
                      type="button"
                      onClick={() => setAgency(ag.name)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                        selected 
                          ? 'border-blue-600 bg-blue-50/40 shadow-md ring-2 ring-blue-100' 
                          : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-11 h-11 rounded-xl flex items-center justify-center p-1.5 shrink-0 border overflow-hidden"
                            style={{ backgroundColor: ag.bg || '#f1f5f9', borderColor: `${ag.color || '#3b82f6'}30` }}
                          >
                            {ag.logo ? (
                              <img 
                                src={ag.logo} 
                                alt={ag.name} 
                                className="max-h-8 max-w-8 object-contain" 
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <AgencyLogo name={ag.name} color={ag.color || '#3b82f6'} size={24} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-xs font-black block leading-tight truncate ${selected ? 'text-blue-950' : 'text-gray-900'}`}>
                              {ag.name}
                            </span>
                            <span className="text-[10px] font-semibold text-gray-400">Transporte</span>
                          </div>
                        </div>
                        <span 
                          className="text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0"
                          style={{ 
                            backgroundColor: selected ? (isRetiro ? '#7c3aed' : '#2563eb') : (isRetiro ? '#f3effe' : (ag.bg || '#eff6ff')), 
                            color: selected ? '#ffffff' : (isRetiro ? '#7c3aed' : (ag.color || '#2563eb')) 
                          }}
                        >
                          {isRetiro ? 'Gratis' : ag.name === 'STARKEN' ? 'Popular' : ag.name === 'BLUEXPRESS' ? 'Rápido' : 'Disponible'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                        {ag.desc || (isRetiro ? 'Retiro presencial en tienda' : `Envío por ${ag.name}`)}
                      </p>
                      {selected && (
                        <div className="mt-2.5 pt-2 border-t border-blue-200 flex items-center justify-between text-[11px] font-extrabold text-blue-700">
                          <span>✓ Agencia elegida</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Destinatario */}
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40 space-y-4">
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <User size={18} className="text-blue-600" /> Datos del Destinatario
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 mb-1.5 block">Nombre Completo *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Ej: Juan Pérez González"
                  className="w-full px-4 py-3 bg-gray-50/70 border border-gray-250 rounded-2xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 mb-1.5 block">RUT Destinatario (Para la agencia)</label>
                <input
                  type="text"
                  value={customerRut}
                  onChange={e => setCustomerRut(e.target.value)}
                  placeholder="Ej: 12.345.678-9"
                  className="w-full px-4 py-3 bg-gray-50/70 border border-gray-250 rounded-2xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-gray-700 mb-1.5 block">Teléfono de Contacto</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="Ej: +56 9 1234 5678"
                  className="w-full px-4 py-3 bg-gray-50/70 border border-gray-250 rounded-2xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Dirección */}
          {agency?.toUpperCase() !== 'RETIRO EN TIENDA' ? (
            <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40 space-y-4">
              <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <MapPin size={18} className="text-blue-600" /> Dirección de Entrega
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block">Región *</label>
                    <select
                      value={region}
                      onChange={e => {
                        setRegion(e.target.value);
                        setComuna('');
                      }}
                      className="w-full px-4 py-3 bg-gray-50/70 border border-gray-250 rounded-2xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                      required
                    >
                      <option value="">Selecciona tu región</option>
                      {Object.keys(CHILE_REGIONES).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block">Comuna *</label>
                    <select
                      value={comuna}
                      onChange={e => setComuna(e.target.value)}
                      disabled={!region}
                      className="w-full px-4 py-3 bg-gray-50/70 border border-gray-250 rounded-2xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition disabled:opacity-50"
                      required
                    >
                      <option value="">{region ? 'Selecciona tu comuna' : 'Primero selecciona región'}</option>
                      {comunas.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1.5 block">Calle y Número (o Sucursal para retiro) *</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Ej: Av. Providencia 1234, Depto 401 (o Sucursal Starken Los Leones)"
                    className="w-full px-4 py-3 bg-gray-50/70 border border-gray-250 rounded-2xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1.5 block">Referencias u observaciones adicionales (opcional)</label>
                  <textarea
                    value={additionalInfo}
                    onChange={e => setAdditionalInfo(e.target.value)}
                    placeholder="Ej: Entre calles X e Y, dejar en conserjería, etc."
                    rows={2}
                    className="w-full px-4 py-3 bg-gray-50/70 border border-gray-250 rounded-2xl text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition resize-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-purple-50/60 rounded-3xl p-5 md:p-6 border border-purple-200 space-y-2">
              <h3 className="text-sm font-extrabold text-purple-900 flex items-center gap-2">
                <MapPin size={16} className="text-purple-600" /> Dirección de Retiro Presencial
              </h3>
              <p className="text-sm font-bold text-purple-950">Chacabuco 08, Estación Central (Región Metropolitana)</p>
              <p className="text-xs font-semibold text-purple-800">
                Referencia: Al lado de Carnicería El Carnicero
              </p>
              <div>
                <a
                  href="https://maps.app.goo.gl/XYFewki3NjcTRoGr7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 underline font-bold hover:text-blue-800 inline-flex items-center gap-1"
                >
                  📍 Ver ubicación en Google Maps (Cómo llegar)
                </a>
              </div>
              <p className="text-xs text-purple-700 pt-1">
                Horario: Lunes a Viernes de 9:00 a 18:00 hrs. Tu pedido estará listo para retiro una vez que confirmemos la preparación.
              </p>
            </div>
          )}

          {/* Submit Button */}
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-2xl font-black text-base shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando datos de despacho...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={20} />
                  <span>Confirmar y Guardar Datos de Despacho</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

export default function DatosEnvioPage() {
  return (
    <Suspense fallback={
      <div className="bg-white min-h-screen py-16 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DatosEnvioContent />
    </Suspense>
  );
}
