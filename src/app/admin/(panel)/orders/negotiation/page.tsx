'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION_ID, ADMIN_CHAT_COLLECTION_ID } from '@/lib/db';
import { Order } from '@/types/admin';
import { RefreshCw, AlertTriangle, Play, ClipboardList, CheckCircle, MessageSquare, Send, X, Bot, User, Eye, Clock, CheckCircle2, AlertCircle, Package, Inbox, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function NegotiationOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderInput, setOrderInput] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [sendingIaId, setSendingIaId] = useState<string | null>(null);

  const [selectedChat, setSelectedChat] = useState<{ phone: string; customerName: string } | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatPhoneForChat = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '').trim();
    if (cleaned.startsWith('56')) return cleaned;
    if (cleaned.length === 9 && cleaned.startsWith('9')) return '56' + cleaned;
    return cleaned;
  };

  const loadChatHistory = useCallback(async (phone: string) => {
    setLoadingChat(true);
    try {
      const formatted = formatPhoneForChat(phone);
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, ADMIN_CHAT_COLLECTION_ID, [
        Query.equal('userId', 'whatsapp:' + formatted),
        Query.orderAsc('$createdAt'),
        Query.limit(100)
      ]);
      setMessages(res.documents);
    } catch (e: any) {
      console.error('Error al cargar historial de chat:', e);
    } finally {
      setLoadingChat(false);
    }
  }, []);

  const handleOpenChat = (phone: string, customerName: string) => {
    setSelectedChat({ phone, customerName });
    loadChatHistory(phone);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    setSendingMessage(true);
    try {
      const formatted = formatPhoneForChat(selectedChat.phone);
      const res = await fetch('/api/admin/whatsapp-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted, message: newMessage.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        setNewMessage('');
        await loadChatHistory(selectedChat.phone);
      } else {
        alert('Error al enviar mensaje: ' + (data.error || 'Ocurrió un error'));
      }
    } catch (e: any) {
      alert('Error de red al enviar: ' + e.message);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendToIa = async (orderId: string) => {
    setSendingIaId(orderId);
    try {
      const res = await fetch('/api/cron/negotiation?secret=negotiation_secret_key_2026&orderId=' + orderId);
      const data = await res.json();
      if (res.ok) {
        if (data.processed && data.processed.length > 0) {
          alert('Negociación iniciada con éxito. Mensaje enviado al cliente.');
        } else if (data.skipped_no_missing && data.skipped_no_missing.length > 0) {
          alert('Error: El pedido no tiene productos marcados como faltantes. Ve al pedido, marca qué productos faltan en el "Panel de Negociación por Productos Faltantes" y luego vuelve a intentarlo.');
        } else if (data.send_errors && data.send_errors.length > 0) {
          alert('Error al enviar WhatsApp:\n' + data.send_errors.join('\n'));
        } else if (data.has_wa_token === false) {
          alert('Error: WHATSAPP_ACCESS_TOKEN no está configurado en las variables de entorno.');
        } else {
          alert('Error: No se pudo enviar el mensaje. Revisa la consola del servidor para más detalles.');
        }
        loadNegotiationOrders();
      } else {
        alert('Error al negociar: ' + (data.error || 'Ocurrió un error'));
      }
    } catch (e: any) {
      alert('Error de red al negociar: ' + e.message);
    } finally {
      setSendingIaId(null);
    }
  };

  const loadNegotiationOrders = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
        Query.equal('STATUS', 'negotiation'),
        Query.orderDesc('CREATEDAT'),
        Query.limit(100)
      ]);
      setOrders(res.documents as unknown as Order[]);
    } catch (e: any) {
      setError('Error al cargar pedidos en negociación: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNegotiationOrders();
  }, [loadNegotiationOrders]);

  const standardizeCode = (input: string) => {
    const cleaned = input.trim().replace(/^#/, '').toUpperCase();
    if (cleaned.startsWith('ORD-')) return cleaned;
    if (/^\d+$/.test(cleaned)) return 'ORD-' + cleaned.padStart(5, '0');
    return cleaned;
  };

  const handleAddOrders = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderInput.trim()) return;

    setIsSubmitting(true);
    setError('');
    setSuccessMsg('');

    const parts = orderInput.split(/[\s,;\n]+/).map(p => p.trim()).filter(Boolean);
    const codesToSearch = Array.from(new Set(parts.map(standardizeCode)));

    if (codesToSearch.length === 0) {
      setIsSubmitting(false);
      return;
    }

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      let addedCount = 0;
      let notFound: string[] = [];

      for (const code of codesToSearch) {
        const res = await databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
          Query.equal('ORDERCODE', code),
          Query.limit(2)
        ]);

        if (res.documents?.length === 1) {
          const doc = res.documents[0];
          if (doc.STATUS !== 'negotiation') {
            await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, doc.$id, {
              STATUS: 'negotiation',
              UPDATEDAT: Date.now()
            });
          }
          addedCount++;
        } else if ((res.documents?.length || 0) > 1) {
          notFound.push(`${code} (folio duplicado; usa el ID del pedido)`);
        } else {
          notFound.push(code);
        }
      }

      setSuccessMsg('Se procesaron con éxito los pedidos. ' + addedCount + ' pedidos están ahora en negociación.');
      if (notFound.length > 0) {
        setError('No se encontraron los siguientes códigos de pedido: ' + notFound.join(', '));
      }
      setOrderInput('');
      loadNegotiationOrders();
    } catch (e: any) {
      setError('Error al procesar pedidos: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  type NegotiationStatus = 'not_opened' | 'in_progress' | 'partial' | 'complete';

  const getNegotiationStatus = (order: Order): { status: NegotiationStatus; missingCount: number; replacedCount: number; openedAt?: number; missingValue: number; missingItemsList: string[] } => {
    let parsed: any[] = [];
    try { parsed = JSON.parse(order.ITEMS || '[]'); } catch {}
    
    let missingCount = 0;
    let missingValue = 0;
    const missingItemsList: string[] = [];
    
    for (const it of parsed) {
      if (it.missing === true) {
        missingCount++;
        missingValue += (it.price || 0) * (it.qty || 1);
        missingItemsList.push(`${it.name} (x${it.qty || 1})`);
      }
    }
    
    const replacedCount = parsed.filter(it => it.replaced === true).length;
    const openedAt = (order as any).NEGOTIATION_OPENED_AT as number | undefined;

    if (missingCount === 0 && replacedCount > 0) return { status: 'complete', missingCount, replacedCount, openedAt, missingValue, missingItemsList };
    if (missingCount > 0 && replacedCount > 0) return { status: 'partial', missingCount, replacedCount, openedAt, missingValue, missingItemsList };
    if (openedAt) return { status: 'in_progress', missingCount, replacedCount, openedAt, missingValue, missingItemsList };
    return { status: 'not_opened', missingCount, replacedCount, openedAt, missingValue, missingItemsList };
  };

  const statusConfig: Record<NegotiationStatus, { label: string; bg: string; text: string; border: string; icon: string; dot: string }> = {
    not_opened: { label: 'Link no abierto', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: '📭', dot: 'bg-gray-400' },
    in_progress: { label: 'Cambio en proceso', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: '⏳', dot: 'bg-amber-500' },
    partial: { label: 'Cambio parcial', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: '🔄', dot: 'bg-blue-500' },
    complete: { label: 'Cambio completo', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: '✅', dot: 'bg-emerald-500' },
  };

  const stats = orders.reduce((acc, o) => {
    const s = getNegotiationStatus(o);
    acc[s.status]++;
    acc.total++;
    acc.totalCredit += s.missingValue;
    return acc;
  }, { not_opened: 0, in_progress: 0, partial: 0, complete: 0, total: 0, totalCredit: 0 });

  const statsCards = [
    { key: 'total', label: 'Total Pedidos', value: stats.total, icon: Inbox, color: 'from-pink-500 to-rose-500' },
    { key: 'credit', label: 'Total Crédito a Favor', value: fmt(stats.totalCredit), icon: Sparkles, color: 'from-fuchsia-500 to-purple-600' },
    { key: 'in_progress', label: 'En proceso / Nuevos', value: stats.in_progress + stats.partial + stats.not_opened, icon: Clock, color: 'from-amber-400 to-orange-500' },
    { key: 'complete', label: 'Completos', value: stats.complete, icon: CheckCircle2, color: 'from-emerald-400 to-teal-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </span>
            Negociación de Pedidos
          </h1>
          <p className="text-sm text-gray-500 mt-1">Administra pedidos con faltantes y coordina reemplazos con tus clientes.</p>
        </div>
        <button
          onClick={loadNegotiationOrders}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw className={'w-3.5 h-3.5 ' + (isLoading ? 'animate-spin' : '')} />
          Actualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statsCards.map((s) => (
          <div key={s.key} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{s.label}</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{s.value}</p>
              </div>
              <div className={'w-10 h-10 rounded-xl bg-gradient-to-br ' + s.color + ' flex items-center justify-center shadow-sm'}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input Card */}
      <details className="bg-white rounded-2xl border border-gray-150 p-5 shadow-sm space-y-4 group">
        <summary className="flex items-center gap-2 cursor-pointer list-none select-none">
          <div className="w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center">
            <Package className="w-4 h-4 text-pink-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-800 group-open:text-pink-600 transition-colors">Agregar Pedidos a Negociación</h2>
            <p className="text-xs text-gray-400 group-open:hidden mt-0.5">Haz clic para ingresar códigos de pedido manualmente...</p>
          </div>
          <div className="ml-auto w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-open:rotate-180 transition-transform">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </summary>

        <div className="pt-4 border-t border-gray-100 mt-4 space-y-4">
          <p className="text-xs text-gray-400">Ingresa los números de pedido separados por comas o saltos de línea (ej: 9, 91, 13, ORD-00001).</p>
          <form onSubmit={handleAddOrders} className="space-y-3">
            <textarea
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              placeholder="Ej: 9, 91, 13, 1"
              rows={3}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white transition resize-none"
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !orderInput.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-xl text-sm font-semibold hover:from-pink-700 hover:to-rose-700 transition disabled:opacity-50 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  'Establecer en Negociación'
                )}
              </button>
            </div>
          </form>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </details>

      {/* Orders List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center bg-gradient-to-r from-gray-50/80 to-white">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-pink-500" />
            Pedidos en Negociación ({orders.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-100">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-5 space-y-3 animate-pulse">
                <div className="flex justify-between"><div className="h-4 w-24 bg-gray-100 rounded" /><div className="h-4 w-16 bg-gray-100 rounded" /></div>
                <div className="h-4 w-40 bg-gray-100 rounded" />
                <div className="h-4 w-32 bg-gray-100 rounded" />
              </div>
            ))
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-gray-400 space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-2">
                <ClipboardList className="w-8 h-8 text-gray-300" />
              </div>
              <p className="font-semibold text-sm text-gray-500">No hay pedidos en negociación</p>
              <p className="text-xs text-gray-400">Usa el formulario superior para añadir pedidos.</p>
            </div>
          ) : (
            orders.map(order => {
              const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
              let itemsCount = 0;
              let hasMissing = false;
              try {
                const parsed = JSON.parse(order.ITEMS || '[]');
                itemsCount = parsed.length;
                hasMissing = parsed.some((it: any) => it.missing === true);
              } catch {}

              const negStatus = getNegotiationStatus(order);
              const sc = statusConfig[negStatus.status];
              const canjeCount = (order as any).CANJE_COUNT || 0;
              const hasCanjeReplacement = itemsCount > 0 && (() => { try { return JSON.parse(order.ITEMS || '[]').some((it: any) => it.isCanjeReplacement); } catch { return false; } })();

              return (
                <div key={order.$id} className="p-5 hover:bg-gray-50/40 transition group border-b border-gray-100 last:border-0">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
                    
                    {/* Left: Info */}
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-lg text-gray-900">#{order.ORDERCODE}</span>
                        <span className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ' + sc.bg + ' ' + sc.text + ' border ' + sc.border}>
                          <span className={'w-2 h-2 rounded-full ' + sc.dot} />
                          {sc.icon} {sc.label}
                        </span>
                        {(canjeCount > 0 || hasCanjeReplacement) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
                            🎁 Canje {canjeCount > 0 ? canjeCount : 1} aplicado
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-gray-500 font-medium ml-2">
                          <User className="w-4 h-4 text-gray-400" />
                          {order.CUSTOMERNAME}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                          <Clock className="w-3.5 h-3.5" />
                          {date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                          <Package className="w-3.5 h-3.5" />
                          {itemsCount} productos ({fmt(order.TOTAL)})
                        </span>
                        {negStatus.openedAt && (
                          <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                            <Eye className="w-3.5 h-3.5" />
                            Visto: {new Date(negStatus.openedAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      {/* Missing Products Details */}
                      {negStatus.missingCount > 0 && (
                        <div className="mt-3 p-3 bg-red-50/50 border border-red-100 rounded-xl space-y-1.5">
                          <p className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4" /> 
                            Productos faltantes ({negStatus.missingCount}):
                          </p>
                          <ul className="text-xs text-red-700 list-disc list-inside space-y-0.5 ml-1">
                            {negStatus.missingItemsList.slice(0, 3).map((name, idx) => (
                              <li key={idx} className="truncate max-w-sm">{name}</li>
                            ))}
                            {negStatus.missingItemsList.length > 3 && (
                              <li className="font-medium">...y {negStatus.missingItemsList.length - 3} más</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Right: Credit & Actions */}
                    <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0 w-full md:w-auto bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                      {/* Credit Display */}
                      <div className="text-center sm:text-right sm:pr-4 sm:border-r border-gray-200 w-full sm:w-auto">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Saldo a Favor</p>
                        <p className="text-xl sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-rose-600">
                          {fmt(negStatus.missingValue)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                        {hasMissing && (
                          <button
                            onClick={() => handleSendToIa(order.$id)}
                            disabled={sendingIaId !== null}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-xl text-xs font-bold hover:from-pink-700 hover:to-rose-700 transition disabled:opacity-50 shadow-sm"
                          >
                            {sendingIaId === order.$id ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                Negociar IA
                              </>
                            )}
                          </button>
                        )}
                        <div className="flex gap-2 flex-1">
                          {order.CUSTOMERPHONE && (
                            <button
                              onClick={() => handleOpenChat(order.CUSTOMERPHONE!, order.CUSTOMERNAME || 'Cliente')}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition shadow-sm"
                            >
                              <MessageSquare className="w-4 h-4 text-emerald-600" />
                              Chat
                            </button>
                          )}
                          <Link
                            href={'/admin/orders/' + order.$id}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition shadow-sm"
                          >
                            <Play className="w-3.5 h-3.5 fill-indigo-700" />
                            Abrir
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat History Modal */}
      {selectedChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl w-full max-w-lg h-[600px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-teal-50">
              <div>
                <h3 className="text-sm font-extrabold text-gray-950 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Chat con {selectedChat.customerName}
                </h3>
                <p className="text-[11px] text-gray-500 font-medium">{selectedChat.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadChatHistory(selectedChat.phone)}
                  disabled={loadingChat}
                  className="p-1.5 rounded-lg border border-emerald-100 bg-white hover:bg-emerald-50 text-emerald-700 transition disabled:opacity-50"
                  title="Actualizar chat"
                >
                  <RefreshCw className={'w-3.5 h-3.5 ' + (loadingChat ? 'animate-spin' : '')} />
                </button>
                <button
                  onClick={() => setSelectedChat(null)}
                  className="p-1.5 rounded-lg border border-gray-250 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50">
              {loadingChat && messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="space-y-2 text-center">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-gray-400">Cargando conversación...</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-2 p-6">
                  <Bot className="w-8 h-8 text-gray-300" />
                  <p className="text-xs font-bold">No hay mensajes registrados aún</p>
                  <p className="text-[11px] text-gray-400 max-w-xs">
                    Cuando la IA envíe la propuesta o respondas, verás la conversación aquí.
                  </p>
                </div>
              ) : (
                messages.map((msg: any) => {
                  const isAdmin = msg.senderRole === 'admin';
                  const date = new Date(msg.$createdAt);
                  const isKenia = isAdmin && (msg.message.includes('Yaxbot') || msg.message.includes('IA') || msg.message.includes('🤖'));

                  return (
                    <div
                      key={msg.$id}
                      className={'flex gap-3 max-w-[85%] ' + (isAdmin ? 'ml-auto flex-row-reverse' : 'mr-auto')}
                    >
                      <div
                        className={'w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ' +
                          (isAdmin
                            ? isKenia ? 'bg-pink-100 text-pink-700 border border-pink-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            : 'bg-emerald-100 text-emerald-700 border border-emerald-200')
                        }
                      >
                        {isAdmin ? (isKenia ? '🤖' : '👤') : '💬'}
                      </div>
                      <div className="space-y-1 flex-1">
                        <div
                          className={'rounded-2xl px-4 py-2.5 text-xs whitespace-pre-wrap leading-relaxed shadow-sm ' +
                            (isAdmin
                              ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-none'
                              : 'bg-white border border-gray-150 text-gray-800 rounded-tl-none')
                          }
                        >
                          {msg.message}
                        </div>
                        <div
                          className={'text-[10px] text-gray-400 font-medium ' + (isAdmin ? 'text-right' : 'text-left')}
                        >
                          {isAdmin ? (isKenia ? 'Yaxbot (IA)' : 'Admin') : 'Cliente'} ·{' '}
                          {date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100 bg-white flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Escribe un mensaje..."
                disabled={sendingMessage}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
              <button
                type="submit"
                disabled={sendingMessage || !newMessage.trim()}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl transition disabled:opacity-50 shrink-0"
              >
                {sendingMessage ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
