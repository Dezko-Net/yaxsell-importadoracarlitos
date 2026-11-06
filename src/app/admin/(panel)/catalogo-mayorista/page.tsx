'use client';

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  ExternalLink,
  RefreshCw,
  Send,
  CheckCircle2,
  Package,
  Sparkles,
  Info,
  Phone,
  UserPlus,
  Edit2,
  Trash2,
  Save,
  Check,
  Copy,
  Users,
  Bot,
  DollarSign,
  Sliders,
  ShieldCheck,
  Plus,
  X,
  MessageCircle,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  Eye,
  AlertCircle
} from 'lucide-react';
import { Attendant, BalatinContact, DEFAULT_WHATSAPP_CONTACTS, DEFAULT_BALATIN_CONTACT } from '@/hooks/useStoreSettings';
import { MODULE_ACCESS } from '@/lib/module-access';

const AVATAR_PRESETS = [
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785997439696-pegada-1785997429956.png',
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785998075009-pegada-1785998072451.png',
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1786020188976-pegada-1786020186663.png',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
];

const COLOR_PRESETS = [
  { label: 'Rojo Pasión', border: 'border-red-400', hover: 'hover:border-red-500', text: 'text-red-500', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700' },
  { label: 'Negro Elegante', border: 'border-gray-500', hover: 'hover:border-gray-600', text: 'text-gray-600', bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-800' },
  { label: 'Rosa Glam', border: 'border-pink-400', hover: 'hover:border-pink-500', text: 'text-pink-500', bg: 'bg-pink-50', badge: 'bg-pink-100 text-pink-700' },
  { label: 'Esmeralda', border: 'border-emerald-400', hover: 'hover:border-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
  { label: 'Azul Real', border: 'border-blue-400', hover: 'hover:border-blue-500', text: 'text-blue-500', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
  { label: 'Ámbar', border: 'border-amber-400', hover: 'hover:border-amber-500', text: 'text-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
];

export default function CatalogoMayoristaAdminPage() {
  const [activeTab, setActiveTab] = useState<'asesoras' | 'reglas' | 'enlaces'>(MODULE_ACCESS.whatsappManagement ? 'asesoras' : 'reglas');

  // Contactos WhatsApp
  const [contacts, setContacts] = useState<Attendant[]>(DEFAULT_WHATSAPP_CONTACTS);
  const [balatin, setBalatin] = useState<BalatinContact>(DEFAULT_BALATIN_CONTACT);
  const [attendantMode, setAttendantMode] = useState<'choice' | 'direct' | 'rotation'>('choice');

  // Reglas del Catálogo
  const [minimumPurchase, setMinimumPurchase] = useState<number>(50000);
  const [allowWhatsappOrders, setAllowWhatsappOrders] = useState<boolean>(true);
  const [allowWebOrders, setAllowWebOrders] = useState<boolean>(true);
  const [whatsappMessageTemplate, setWhatsappMessageTemplate] = useState<string>(
    '¡Hola! Vengo del Catálogo Mayorista y quiero realizar el siguiente pedido:'
  );

  // Estados UI
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Modal para editar o crear asesora
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [modalForm, setModalForm] = useState<Attendant>({
    id: 0,
    name: '',
    number: '',
    img: '',
    sub: 'Asesora Mayorista',
    border: 'border-red-400',
    hover: 'hover:border-red-500',
    text: 'text-red-500',
    active: true,
    floatingEmojis: ['❤️', '✨', '🛍️'],
  });

  // Cargar configuración de Firestore al montar
  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const res = await fetch('/api/store-settings', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.whatsappContacts) && data.whatsappContacts.length > 0) {
            setContacts(data.whatsappContacts);
          }
          if (data.balatinContact) {
            setBalatin(data.balatinContact);
          }
          if (data.attendantMode) {
            setAttendantMode(data.attendantMode);
          }
          if (data.minimumPurchase !== undefined) {
            setMinimumPurchase(Number(data.minimumPurchase));
          }
          if (data.allowWhatsappOrders !== undefined) {
            setAllowWhatsappOrders(Boolean(data.allowWhatsappOrders));
          }
          if (data.allowWebOrders !== undefined) {
            setAllowWebOrders(Boolean(data.allowWebOrders));
          }
          if (data.whatsappMessageTemplate) {
            setWhatsappMessageTemplate(data.whatsappMessageTemplate);
          }
        }
      } catch (err) {
        console.error('Error al cargar configuración de catálogo:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Guardar cambios en Firestore y sincronizar
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      const payload = {
        minimumPurchase,
        allowWebOrders,
        ...(MODULE_ACCESS.whatsappManagement ? { whatsappContacts: contacts, balatinContact: balatin, attendantMode, allowWhatsappOrders, whatsappMessageTemplate } : {}),
      };

      const res = await fetch('/api/store-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Actualizar localStorage para sincronización instantánea local
        try {
          if (MODULE_ACCESS.whatsappManagement) {
            localStorage.setItem('store_whatsapp_contacts', JSON.stringify(contacts));
            localStorage.setItem('store_balatin_contact', JSON.stringify(balatin));
          }
          const storedBank = JSON.parse(localStorage.getItem('store_bank_details') || '{}');
          localStorage.setItem('store_bank_details', JSON.stringify({
            ...storedBank,
            minimumPurchase: String(minimumPurchase),
          }));
        } catch {}

        // Disparar evento global para que componentes de React en la misma pestaña actualicen
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('store-settings-updated', { detail: payload }));
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else {
        alert('Hubo un error al guardar la configuración. Por favor intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error al guardar:', err);
      alert('Error de conexión al guardar.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle estado activo de una asesora con 1 click
  const toggleContactActive = (index: number) => {
    const updated = [...contacts];
    updated[index].active = !updated[index].active;
    setContacts(updated);
  };

  // Abrir modal para crear asesora
  const handleOpenCreate = () => {
    setModalForm({
      id: Date.now(),
      name: '',
      number: '569',
      img: AVATAR_PRESETS[0],
      sub: 'Asesora Mayorista',
      border: 'border-red-400',
      hover: 'hover:border-red-500',
      text: 'text-red-500',
      active: true,
      floatingEmojis: ['❤️', '✨', '🛍️'],
    });
    setIsCreating(true);
    setEditingIndex(null);
  };

  // Abrir modal para editar asesora
  const handleOpenEdit = (index: number) => {
    setModalForm({ ...contacts[index] });
    setEditingIndex(index);
    setIsCreating(false);
  };

  // Guardar formulario del modal
  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.name.trim() || !modalForm.number.trim()) {
      alert('Por favor ingresa un nombre y un número de WhatsApp válidos.');
      return;
    }

    // Normalizar número de teléfono (quitar +, espacios y guiones)
    let cleanNumber = modalForm.number.replace(/\D/g, '');
    if (!cleanNumber.startsWith('56') && cleanNumber.length === 9) {
      cleanNumber = '56' + cleanNumber;
    }

    const cleanContact: Attendant = {
      ...modalForm,
      number: cleanNumber,
    };

    if (isCreating) {
      setContacts([...contacts, cleanContact]);
    } else if (editingIndex !== null) {
      const updated = [...contacts];
      updated[editingIndex] = cleanContact;
      setContacts(updated);
    }

    setEditingIndex(null);
    setIsCreating(false);
  };

  // Eliminar asesora
  const handleDeleteContact = (index: number) => {
    if (contacts.length <= 1) {
      alert('Debe existir al menos una asesora registrada para recibir pedidos.');
      return;
    }
    const name = contacts[index].name;
    if (confirm(`¿Estás seguro de eliminar a la asesora "${name}"?`)) {
      const updated = contacts.filter((_, i) => i !== index);
      setContacts(updated);
    }
  };

  // Copiar al portapapeles
  const handleCopy = (text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedLink(label);
      setTimeout(() => setCopiedLink(null), 2500);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 w-full max-w-6xl mx-auto font-sans">
      {/* Toast Notificación de Guardado */}
      {saved && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
          <CheckCircle2 size={24} className="text-white animate-bounce" />
          <div>
            <p className="font-black text-sm">¡Cambios guardados con éxito!</p>
            <p className="text-xs text-emerald-100">
              Las asesoras y reglas se sincronizaron en el catálogo y carrito de inmediato.
            </p>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="relative overflow-hidden bg-white border border-gray-100 rounded-[2.5rem] p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] group transition-all duration-500 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-amber-500/10 to-orange-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none transition-transform duration-700 group-hover:scale-105"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-emerald-500/5 to-transparent rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200/60 uppercase tracking-widest shadow-sm">
                Control de Ventas Mayoristas
              </span>
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200/60 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Sincronización en Tiempo Real
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight leading-[1.1]">
              {MODULE_ACCESS.whatsappManagement ? 'Asesoras y Reglas del' : 'Configuración del'}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600">
                Catálogo Mayorista
              </span>
            </h1>
            <p className="text-base text-gray-500 font-medium leading-relaxed max-w-xl">
              {MODULE_ACCESS.whatsappManagement ? 'Configura la atención por WhatsApp, la compra mínima y los canales de compra.' : 'Define la compra mínima y los canales de compra de tus clientes.'}
            </p>
          </div>

          {/* Botones de Acción Superiores */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
            <a
              href="/productos"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm transition-all duration-300 shadow-sm hover:shadow"
            >
              <Eye size={18} />
              <span>Ver Catálogo</span>
              <ExternalLink size={15} className="text-gray-400" />
            </a>

            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm transition-all duration-300 shadow-[0_10px_25px_rgba(16,185,129,0.3)] hover:shadow-[0_12px_30px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="relative z-10 flex flex-wrap gap-2 mt-8 pt-6 border-t border-gray-100">
          {MODULE_ACCESS.whatsappManagement && <button
            onClick={() => setActiveTab('asesoras')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-sm transition-all duration-200 ${
              activeTab === 'asesoras'
                ? 'bg-gray-900 text-white shadow-md'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Users size={18} />
            <span>Asesoras WhatsApp</span>
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-black ${
              activeTab === 'asesoras' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
            }`}>
              {contacts.filter(c => c.active !== false).length} activas
            </span>
          </button>}

          <button
            onClick={() => setActiveTab('reglas')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-sm transition-all duration-200 ${
              activeTab === 'reglas'
                ? 'bg-gray-900 text-white shadow-md'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Sliders size={18} />
            <span>Reglas & Compra Mínima</span>
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-black ${
              activeTab === 'reglas' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
            }`}>
              ${minimumPurchase.toLocaleString('es-CL')}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('enlaces')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-sm transition-all duration-200 ${
              activeTab === 'enlaces'
                ? 'bg-gray-900 text-white shadow-md'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <ExternalLink size={18} />
            <span>Enlaces y Difusión</span>
          </button>
        </div>
      </div>

      {/* CONTENIDO TAB 1: ASESORAS DE WHATSAPP */}
      {MODULE_ACCESS.whatsappManagement && activeTab === 'asesoras' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Selector de Modo de Atención */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
                <Sliders size={22} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Modo de Asignación de Pedidos
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  ¿Cómo quieres que se distribuyan los clientes al pedir por WhatsApp?
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Opción 1: Cliente Elige */}
              <div
                onClick={() => setAttendantMode('choice')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  attendantMode === 'choice'
                    ? 'border-amber-500 bg-amber-50/40 shadow-md ring-2 ring-amber-500/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                      👥 Cliente Elige
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed font-medium">
                    Muestra un modal con las asesoras disponibles (con fotos y nombres) para que el cliente elija a su vendedora de confianza.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400">Ventana modal</span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    attendantMode === 'choice' ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-300'
                  }`}>
                    {attendantMode === 'choice' && <Check size={10} strokeWidth={3} />}
                  </div>
                </div>
              </div>

              {/* Opción 2: Asignación Directa */}
              <div
                onClick={() => setAttendantMode('direct')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  attendantMode === 'direct'
                    ? 'border-amber-500 bg-amber-50/40 shadow-md ring-2 ring-amber-500/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                      ⚡ Asignación Directa
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed font-medium">
                    Envía el pedido directamente a la primera asesora activa en la lista, sin abrir modal previo de selección.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400">1-click directo</span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    attendantMode === 'direct' ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-300'
                  }`}>
                    {attendantMode === 'direct' && <Check size={10} strokeWidth={3} />}
                  </div>
                </div>
              </div>

              {/* Opción 3: Rotación Automática */}
              <div
                onClick={() => setAttendantMode('rotation')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  attendantMode === 'rotation'
                    ? 'border-amber-500 bg-amber-50/40 shadow-md ring-2 ring-amber-500/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                      🔄 Rotación Equitativa
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed font-medium">
                    Distribuye aleatoriamente cada nuevo pedido entre todas las asesoras que tengan el turno activo.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400">Equitativo</span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    attendantMode === 'rotation' ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-300'
                  }`}>
                    {attendantMode === 'rotation' && <Check size={10} strokeWidth={3} />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjetas de Asesoras Humanas */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <span>Asesoras Registradas</span>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-bold">
                    {contacts.length} {contacts.length === 1 ? 'persona' : 'personas'}
                  </span>
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  Modifica sus datos, números de WhatsApp y activa/pausa sus turnos de atención.
                </p>
              </div>

              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs transition-all shadow-sm hover:shadow"
              >
                <Plus size={16} />
                <span>Nueva Asesora</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {contacts.map((contact, idx) => {
                const isActive = contact.active !== false;
                return (
                  <div
                    key={contact.id || idx}
                    className={`relative rounded-2xl border-2 transition-all duration-300 p-6 flex flex-col justify-between ${
                      isActive
                        ? 'border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md'
                        : 'border-dashed border-gray-300 bg-gray-50/70 opacity-75'
                    }`}
                  >
                    {/* Header Tarjeta */}
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <img
                              src={contact.img || AVATAR_PRESETS[0]}
                              alt={contact.name}
                              className={`w-16 h-16 rounded-full object-cover border-2 shadow-sm ${
                                contact.border || 'border-gray-300'
                              }`}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <span
                              className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
                                isActive ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-gray-400'
                              }`}
                              title={isActive ? 'En Turno (Activa)' : 'Fuera de Turno'}
                            />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-gray-900 text-lg">{contact.name}</h4>
                              {contact.floatingEmojis && contact.floatingEmojis.length > 0 && (
                                <span className="text-sm">{contact.floatingEmojis.join('')}</span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-gray-500">
                              {contact.sub || 'Asesora de Ventas'}
                            </p>
                            <a
                              href={`https://wa.me/${contact.number}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-600 hover:text-emerald-700 mt-1"
                            >
                              <Phone size={12} />
                              <span>+{contact.number}</span>
                            </a>
                          </div>
                        </div>

                        {/* Botón Switch Activo/Pausa */}
                        <button
                          type="button"
                          onClick={() => toggleContactActive(idx)}
                          className={`px-3 py-1.5 rounded-full text-xs font-black transition-all flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                          title={isActive ? 'Click para pausar turno' : 'Click para activar turno'}
                        >
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          <span>{isActive ? 'En Turno' : 'Pausada'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Footer Tarjeta con Acciones */}
                    <div className="pt-4 mt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                      <a
                        href={`https://wa.me/${contact.number}?text=Hola%20${encodeURIComponent(contact.name)},%20prueba%20desde%20Yaxsell%20Demo`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-emerald-600 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-emerald-50 transition-colors"
                      >
                        <MessageCircle size={14} />
                        <span>Probar WhatsApp</span>
                      </a>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(idx)}
                          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Editar Asesora"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(idx)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar Asesora"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tarjeta de Asistente Virtual Balatin (IA) */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <img
                    src={balatin.img || DEFAULT_BALATIN_CONTACT.img}
                    alt={balatin.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-indigo-400/50 shadow-lg"
                  />
                  <span className="absolute -top-1 -right-1 p-1 bg-indigo-500 rounded-full text-white">
                    <Sparkles size={12} />
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xl font-black text-white">{balatin.name}</h4>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                      Asistente IA
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200 font-medium">
                    Bot automatizado que atiende al instante pedidos de clientes 24/7.
                  </p>
                  <p className="text-xs font-mono text-indigo-300 font-bold flex items-center gap-1 pt-1">
                    <Phone size={12} />
                    <span>+{balatin.number}</span>
                  </p>
                </div>
              </div>

              {/* Controles de Balatin */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBalatin({ ...balatin, active: !balatin.active })}
                  className={`px-5 py-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    balatin.active
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg'
                      : 'bg-white/10 hover:bg-white/20 text-gray-300'
                  }`}
                >
                  <Bot size={16} />
                  <span>{balatin.active ? 'Balatin Activo en Modal' : 'Balatin Oculto'}</span>
                </button>

                <a
                  href={`https://wa.me/${balatin.number}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle size={15} />
                  <span>Probar Chat</span>
                </a>
              </div>
            </div>

            {/* Inputs editables rápidos de Balatin */}
            <div className="relative z-10 mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-indigo-200 mb-1.5">
                  Nombre del Asistente
                </label>
                <input
                  type="text"
                  value={balatin.name}
                  onChange={(e) => setBalatin({ ...balatin, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Ej: Balatin"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-200 mb-1.5">
                  Número de WhatsApp de Balatin
                </label>
                <input
                  type="text"
                  value={balatin.number}
                  onChange={(e) => setBalatin({ ...balatin, number: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Ej: 56954592656"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 2: REGLAS & COMPRA MÍNIMA */}
      {activeTab === 'reglas' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Monto Mínimo de Compra Mayorista */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
                <DollarSign size={22} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Monto Mínimo de Compra Mayorista
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  Define el valor mínimo que un cliente debe acumular en su carrito para poder cursar su pedido.
                </p>
              </div>
            </div>

            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Valor Actual en Pesos Chilenos (CLP)
                </label>
                <div className="relative rounded-2xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-gray-400 font-bold text-lg">
                    $
                  </div>
                  <input
                    type="number"
                    step="5000"
                    min="0"
                    value={minimumPurchase}
                    onChange={(e) => setMinimumPurchase(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-12 pr-6 py-4 rounded-2xl border-2 border-gray-200 focus:border-amber-500 focus:outline-none text-2xl font-black text-gray-900 tracking-tight transition-all"
                  />
                </div>
              </div>

              {/* Botones de Presets Rápidos */}
              <div>
                <span className="block text-xs font-bold text-gray-500 mb-2">
                  Valores comunes rápidos:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[20000, 35000, 50000, 75000, 100000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMinimumPurchase(val)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                        minimumPurchase === val
                          ? 'bg-amber-500 text-white shadow-md scale-105'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      ${val.toLocaleString('es-CL')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-3">
                <Info size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  Este monto se sincroniza automáticamente en la barra superior del catálogo, el carrito flotante de Shopify y la página de checkout web.
                </p>
              </div>
            </div>
          </div>

          {/* Canales de Pedidos Permitidos */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                <ShoppingBag size={22} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Canales de Recepción de Pedidos
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  Habilita o deshabilita los métodos disponibles para que el cliente cierre su compra.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MODULE_ACCESS.whatsappManagement && <>
              {/* WhatsApp Checkout */}
              <div className="p-6 rounded-2xl border border-gray-200 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                    <Send size={18} className="text-emerald-500" />
                    Pedidos por WhatsApp
                  </span>
                  <p className="text-xs text-gray-500 font-medium">
                    Permite enviar la canasta armada a una asesora por chat.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowWhatsappOrders(!allowWhatsappOrders)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    allowWhatsappOrders ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      allowWhatsappOrders ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              </>}
              {/* Web Checkout */}
              <div className="p-6 rounded-2xl border border-gray-200 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                    <ShoppingBag size={18} className="text-blue-500" />
                    Pedidos por Carrito Web
                  </span>
                  <p className="text-xs text-gray-500 font-medium">
                    Permite confirmar pedido en la tienda con transferencia bancaria y subida de comprobante.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowWebOrders(!allowWebOrders)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    allowWebOrders ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      allowWebOrders ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {MODULE_ACCESS.whatsappManagement && <>
          {/* Plantilla de Saludo WhatsApp */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100">
                <MessageCircle size={22} className="text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Plantilla de Mensaje para WhatsApp
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  Texto inicial con el que comenzará el mensaje predeterminado enviado por el cliente.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <textarea
                rows={3}
                value={whatsappMessageTemplate}
                onChange={(e) => setWhatsappMessageTemplate(e.target.value)}
                className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-sm text-gray-800 font-medium transition-all"
                placeholder="¡Hola! Vengo del Catálogo Mayorista y quiero realizar el siguiente pedido:"
              />
              <p className="text-xs text-gray-400 font-medium">
                Debajo de esta frase, el sistema agregará automáticamente la lista numerada de productos, cantidades, precios y el total a pagar.
              </p>
            </div>
          </div>
          </>}
        </div>
      )}

      {/* CONTENIDO TAB 3: ENLACES Y DIFUSIÓN */}
      {activeTab === 'enlaces' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                <ExternalLink size={22} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                  Enlaces Oficiales del Catálogo
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  Copia estos enlaces para colocarlos en tu biografía de Instagram, mensajes de difusión o estados de WhatsApp.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Enlace 1: Catálogo Completo */}
              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      Catálogo Mayorista
                    </span>
                    <h4 className="font-extrabold text-gray-900 text-sm">Vista de Productos Interactiva</h4>
                  </div>
                  <code className="text-xs font-mono font-bold text-gray-700 block select-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/productos` : '/productos'}
                  </code>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleCopy(typeof window !== 'undefined' ? `${window.location.origin}/productos` : 'https://yaxsell.cl/productos', 'cat')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-xs font-extrabold text-gray-800 transition-all shadow-sm"
                  >
                    {copiedLink === 'cat' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copiedLink === 'cat' ? '¡Copiado!' : 'Copiar'}</span>
                  </button>

                  <a
                    href="/productos"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-extrabold transition-all shadow-sm"
                  >
                    <Eye size={14} />
                    <span>Abrir</span>
                  </a>
                </div>
              </div>

              {/* Enlace 2: Checkout Web */}
              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                      Checkout
                    </span>
                    <h4 className="font-extrabold text-gray-900 text-sm">Pasarela de Compra y Transferencia</h4>
                  </div>
                  <code className="text-xs font-mono font-bold text-gray-700 block select-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/checkout` : '/checkout'}
                  </code>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleCopy(typeof window !== 'undefined' ? `${window.location.origin}/checkout` : 'https://yaxsell.cl/checkout', 'chk')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-xs font-extrabold text-gray-800 transition-all shadow-sm"
                  >
                    {copiedLink === 'chk' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copiedLink === 'chk' ? '¡Copiado!' : 'Copiar'}</span>
                  </button>

                  <a
                    href="/checkout"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-extrabold transition-all shadow-sm"
                  >
                    <Eye size={14} />
                    <span>Abrir</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CREAR O EDITAR ASESORA */}
      {(isCreating || editingIndex !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 p-6 md:p-8 space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                  <UserPlus size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">
                    {isCreating ? 'Agregar Nueva Asesora' : `Editar a ${modalForm.name || 'Asesora'}`}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Configura los datos con los que aparecerá ante los clientes.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingIndex(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveModal} className="space-y-5">
              {/* Nombre y Cargo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Nombre de la Asesora *
                  </label>
                  <input
                    type="text"
                    required
                    value={modalForm.name}
                    onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-amber-500 focus:outline-none text-sm font-bold text-gray-900"
                    placeholder="Ej: Lissy, Fernanda, Camila"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Cargo / Subtítulo
                  </label>
                  <input
                    type="text"
                    value={modalForm.sub || ''}
                    onChange={(e) => setModalForm({ ...modalForm, sub: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-amber-500 focus:outline-none text-sm text-gray-900 font-medium"
                    placeholder="Ej: Personalizado, Asesora Mayorista"
                  />
                </div>
              </div>

              {/* Teléfono WhatsApp */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Número de WhatsApp (con código de país) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 text-sm font-mono font-bold">
                    +
                  </div>
                  <input
                    type="text"
                    required
                    value={modalForm.number}
                    onChange={(e) => setModalForm({ ...modalForm, number: e.target.value })}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 focus:border-amber-500 focus:outline-none text-sm font-mono font-bold text-gray-900"
                    placeholder="56954592656"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Ingresa el número completo sin espacios. Para Chile debe comenzar con 569 seguido de 8 dígitos.
                </p>
              </div>

              {/* URL de Foto / Avatar */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  URL de Foto o Avatar
                </label>
                <input
                  type="url"
                  value={modalForm.img || ''}
                  onChange={(e) => setModalForm({ ...modalForm, img: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-amber-500 focus:outline-none text-xs font-mono text-gray-700"
                  placeholder="https://..."
                />
                
                {/* Selector rápido de fotos demo */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-400">Avatares demo:</span>
                  <div className="flex items-center gap-1.5">
                    {AVATAR_PRESETS.map((url, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => setModalForm({ ...modalForm, img: url })}
                        className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-transform hover:scale-110 ${
                          modalForm.img === url ? 'border-amber-500 ring-2 ring-amber-300' : 'border-gray-200'
                        }`}
                      >
                        <img src={url} alt={`Preset ${i}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Estilo de Color */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Color de Borde y Acento
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {COLOR_PRESETS.map((color) => {
                    const isSelected = modalForm.border === color.border;
                    return (
                      <button
                        type="button"
                        key={color.label}
                        onClick={() =>
                          setModalForm({
                            ...modalForm,
                            border: color.border,
                            hover: color.hover,
                            text: color.text,
                          })
                        }
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                          isSelected
                            ? 'border-gray-900 bg-gray-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-full border ${color.border} ${color.bg}`} />
                        <span className="truncate text-gray-800">{color.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Estado Activo */}
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-extrabold text-gray-900 text-xs block">
                    ¿Asesora activa para recibir pedidos?
                  </span>
                  <span className="text-[11px] text-gray-500">
                    Si se desactiva, no aparecerá en el catálogo ni se le enviarán mensajes.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalForm({ ...modalForm, active: !modalForm.active })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    modalForm.active ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      modalForm.active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Botones de acción del modal */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingIndex(null);
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-extrabold shadow-sm hover:shadow transition-all"
                >
                  {isCreating ? 'Agregar Asesora' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


