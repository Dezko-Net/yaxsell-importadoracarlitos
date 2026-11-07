'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Send, Copy, ExternalLink, Check, AlertTriangle, 
  CheckCircle2, Bot, Truck, MessageCircle 
} from 'lucide-react';
import { hasShippingData } from '@/lib/order-rules';
import { useWebClientConfig } from '@/hooks/useWebClientConfig';

export interface ShippingNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    $id: string;
    ORDERCODE?: string;
    CUSTOMERNAME?: string;
    CUSTOMERPHONE?: string;
    ADDRESS?: string;
    SHIPPINGADDRESS?: string;
    COMUNA?: string;
    REGION?: string;
    SHIPPINGAGENCY?: string;
    TOTAL?: number;
  } | null;
  initialData?: {
    message?: string;
    waLink?: string;
    autoSent?: boolean;
    autoSendError?: string | null;
  } | null;
}

export function ShippingNotificationModal({
  isOpen,
  onClose,
  order,
  initialData,
}: ShippingNotificationModalProps) {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sendingBot, setSendingBot] = useState(false);
  const [botSentSuccess, setBotSentSuccess] = useState<boolean | null>(null);
  const [botSentError, setBotSentError] = useState<string | null>(null);
  const [customMsg, setCustomMsg] = useState('');
  const { config: webConfig } = useWebClientConfig();

  const orderCode = order?.ORDERCODE || (order?.$id ? '#' + order.$id.slice(-6) : '');
  const customerName = (order?.CUSTOMERNAME || 'Cliente').split(' ')[0];
  const rawPhone = order?.CUSTOMERPHONE || '';
  const cleanDigits = rawPhone.replace(/[^0-9]/g, '');
  const phoneWithCountry = cleanDigits.startsWith('56') ? cleanDigits : '56' + cleanDigits;

  const siteUrl = webConfig.siteUrl;
  const shippingUrl = order && siteUrl ? `${siteUrl}/datos-envio?id=${encodeURIComponent(order.$id)}` : '';

  const defaultMessage = `¡Hola ${customerName}! 🐾✨ Te escribimos de ${webConfig.storeName}.\n\n` +
    `✅ Tu pago del pedido *#${orderCode}* fue verificado y confirmado con éxito, y tus productos ya están *100% apartados en bodega* 📦.\n\n` +
    `👉 Para poder armar tu paquete y despacharlo lo antes posible, por favor completa tu dirección y selecciona tu agencia de transporte en este enlace:\n` +
    `🔗 ${shippingUrl || 'Configura la URL pública en Admin Supreme Web'}\n\n` +
    `*(Solo te tomará 1 minuto; tu comprobante de transferencia ya está guardado en el sistema)*. ¡Muchas gracias por tu compra! 🙌`;

  useEffect(() => {
    if (isOpen && order) {
      setCustomMsg(initialData?.message || defaultMessage);
      setBotSentSuccess(initialData?.autoSent ?? null);
      setBotSentError(initialData?.autoSendError || null);
      setCopiedMsg(false);
      setCopiedLink(false);
    }
  }, [isOpen, order, initialData, webConfig.siteUrl, webConfig.storeName]);

  if (!isOpen || !order) return null;

  const hasShippingDataResult = hasShippingData(order);

  const waLink = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(customMsg || defaultMessage)}`;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(customMsg || defaultMessage);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2500);
    } catch {}
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shippingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  const handleSendViaBot = async () => {
    setSendingBot(true);
    setBotSentError(null);
    try {
      const res = await fetch('/api/admin/orders/notify-shipping-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.$id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al enviar');
      }
      if (data.autoSent) {
        setBotSentSuccess(true);
        setBotSentError(null);
      } else {
        setBotSentSuccess(false);
        setBotSentError(data.autoSendError || 'La ventana de 24h de Meta requiere envío manual');
      }
    } catch (err: any) {
      setBotSentSuccess(false);
      setBotSentError(err.message || 'Error al conectar con la API de WhatsApp');
    } finally {
      setSendingBot(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                Pedir Datos de Envío
              </h3>
              <p className="text-xs text-slate-500">
                Pedido <span className="font-mono font-bold text-teal-700">#{orderCode}</span> · {order.CUSTOMERNAME}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
          {/* Status badge: whether customer already has shipping info */}
          <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${hasShippingDataResult ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-950'}`}>
            {hasShippingDataResult ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">
                {hasShippingDataResult ? 'Datos de entrega ya registrados:' : 'El cliente aún no ingresa sus datos de entrega:'}
              </p>
              <p className="opacity-90 mt-0.5">
                {hasShippingDataResult
                  ? `${order.SHIPPINGAGENCY || 'Agencia'} · ${order.ADDRESS || order.SHIPPINGADDRESS}, ${order.COMUNA} (${order.REGION || ''})`
                  : 'Falta dirección, comuna o agencia. Al presionar el botón le enviaremos el enlace para que los ingrese de inmediato.'}
              </p>
            </div>
          </div>

          {/* Bot delivery status banner */}
          {botSentSuccess === true && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center gap-2.5 font-semibold">
              <Bot className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>🤖 ¡El bot envió automáticamente el mensaje al WhatsApp del cliente (+{phoneWithCountry})!</span>
            </div>
          )}

          {botSentSuccess === false && botSentError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-xs flex items-center gap-2.5 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {botSentError.includes('24h') || botSentError.includes('WHATSAPP_ACCESS_TOKEN')
                  ? 'Usa el botón verde "Abrir en WhatsApp" para enviarlo directamente con 1 clic.'
                  : `Aviso bot: ${botSentError}. Puedes usar el botón "Abrir en WhatsApp" a continuación.`}
              </span>
            </div>
          )}

          {/* Message Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Mensaje a enviar por WhatsApp:</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-teal-50 transition"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedLink ? 'Link copiado' : 'Copiar Link'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-100 transition"
                >
                  {copiedMsg ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedMsg ? 'Copiado' : 'Copiar Texto'}
                </button>
              </div>
            </div>
            <textarea
              rows={6}
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
              className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 leading-relaxed resize-none"
            />
          </div>

          {/* Quick link highlight */}
          <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-between text-xs gap-2">
            <span className="text-slate-500 truncate font-mono text-[11px]">
              👉 {shippingUrl}
            </span>
            <a
              href={shippingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-600 hover:underline shrink-0"
            >
              Probar link <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
          {/* Automatic Bot Send */}
          <button
            type="button"
            onClick={handleSendViaBot}
            disabled={sendingBot}
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Bot className="w-4 h-4 text-teal-400" />
            {sendingBot ? 'Enviando con Bot...' : '🤖 Enviar vía Bot'}
          </button>

          {/* Manual WhatsApp Button */}
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer text-center"
          >
            <MessageCircle className="w-4 h-4 fill-current" />
            <span>💬 Abrir en WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
}
