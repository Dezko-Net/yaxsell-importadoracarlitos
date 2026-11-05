'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  X,
  Trash2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { AI_ENABLED } from '@/lib/feature-flags';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  meta?: {
    desde?: string;
    hasta?: string;
    usuarioFiltro?: string | null;
    productos?: Array<{
      sku: string;
      nombre: string;
      stock: number;
      costoNeto: number;
      precioDetalle: number;
    }>;
  };
  error?: boolean;
}

const STORAGE_KEY = 'yaxsell_base_datos_ai_chat_history_v1';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome_db_ai',
  role: 'assistant',
  text: `Hola. Puedo consultar costos, márgenes, inventario, ventas por fecha y movimientos de stock.

Dime qué producto, persona o período quieres revisar.`,
  timestamp: Date.now(),
};

const SUGGESTION_CHIPS = [
  '¿Cuáles son los costos y márgenes de Ladysoft?',
  '¿Cuánto se vendió el viernes pasado?',
  '¿Quién movió stock hoy?',
  '¿Qué movimientos hizo Daniel?',
  '¿Cuánto stock y costo tiene el jabón líquido?',
];

function formatTimeChile(ts: number): string {
  try {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

/**
 * Renderizador de Markdown ligero y seguro para las respuestas de la IA
 */
function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-slate-700">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Separadores
        if (trimmed === '---') {
          return <hr key={idx} className="my-2 border-slate-200" />;
        }

        // Títulos
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="font-bold text-blue-700 text-sm mt-2">
              {renderFormatted(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="font-bold text-blue-800 text-sm mt-2.5">
              {renderFormatted(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={idx} className="font-extrabold text-slate-900 text-base mt-3">
              {renderFormatted(trimmed.slice(2))}
            </h2>
          );
        }

        // Viñetas
        if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const raw = trimmed.replace(/^[•\-\*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-blue-600 font-bold select-none">•</span>
              <div className="flex-1">{renderFormatted(raw)}</div>
            </div>
          );
        }

        // Citas / Notas
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote key={idx} className="border-l-2 border-blue-500 pl-2.5 py-0.5 text-slate-600 italic my-1 bg-blue-50 rounded-r-md">
              {renderFormatted(trimmed.slice(2))}
            </blockquote>
          );
        }

        return <p key={idx}>{renderFormatted(line)}</p>;
      })}
    </div>
  );
}

function renderFormatted(text: string): React.ReactNode {
  // Manejo de Negritas, Código y Enlaces simples
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    if (match[2]) {
      // Negrita **texto**
      parts.push(
        <strong key={match.index} className="font-semibold text-slate-900">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Código `codigo`
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200">
          {match[3]}
        </code>
      );
    } else if (match[4]) {
      // Cursiva *texto*
      parts.push(
        <em key={match.index} className="italic text-slate-600">
          {match[4]}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function BaseDatosAIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 1. Cargar historial persistente desde localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch (e) {
      console.warn('[BaseDatosAIChatbot] Error al leer historial de localStorage:', e);
    }
  }, []);

  // 2. Guardar historial cuando cambie
  useEffect(() => {
    try {
      if (messages.length > 1 || (messages.length === 1 && messages[0].id !== WELCOME_MESSAGE.id)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
      }
    } catch (e) {
      console.warn('[BaseDatosAIChatbot] Error al guardar historial en localStorage:', e);
    }
  }, [messages]);

  // 3. Scroll automático al último mensaje
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // 4. Focus al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  if (!AI_ENABLED) return null;

  const handleClearHistory = () => {
    if (window.confirm('¿Deseas reiniciar la conversación de la IA y limpiar el historial?')) {
      setMessages([
        {
          ...WELCOME_MESSAGE,
          id: `welcome_${Date.now()}`,
          timestamp: Date.now(),
        },
      ]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async (customPrompt?: string) => {
    const question = (customPrompt ?? input).trim();
    if (!question || loading) return;

    setInput('');
    const userMessage: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: question,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    // Preparar historial limpio para la IA
    const history = messages
      .filter(m => !m.error && m.id !== 'welcome_db_ai')
      .slice(-6)
      .map(m => ({ role: m.role, text: m.text }));

    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/erp/chat-database', {
        method: 'POST',
        headers,
        body: JSON.stringify({ question, history }),
        cache: 'no-store',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'No fue posible consultar la base de datos en este momento.');
      }

      const assistantMessage: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: String(data.answer || 'Información obtenida correctamente.'),
        timestamp: Date.now(),
        meta: data.meta,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        text: err?.message || 'Ocurrió un error al procesar tu consulta con la IA.',
        timestamp: Date.now(),
        error: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Acceso flotante al asistente */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[9999] flex items-center group">
          {/* Tooltip visible en hover desktop */}
          <div className="hidden sm:flex items-center gap-2 mr-3 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Consulta costos, stock, ventas y movimientos</span>
          </div>

          <button
            onClick={() => setIsOpen(true)}
            aria-label="Abrir Asistente IA de Base de Datos"
            className="flex items-center justify-center gap-2 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-slate-900/10 border border-blue-700/10 active:scale-[0.98] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-white/15">
                <Bot size={18} className="text-white" />
              </div>
              <span>Asistente de datos</span>
            </div>
          </button>
        </div>
      )}

      {/* Ventana del asistente */}
      {isOpen && (
        <div
          className={`fixed z-[99999] transition-all duration-200 flex flex-col overflow-hidden bg-white border border-slate-200 shadow-[0_20px_50px_rgba(15,23,42,0.18)] ${
            isExpanded
              ? 'inset-2 sm:inset-6 rounded-2xl'
              : 'inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[460px] h-[86vh] sm:h-[650px] max-h-[800px] rounded-t-3xl sm:rounded-3xl'
          }`}
        >
          {/* Header Superior */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-white border-b border-slate-200">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                <Bot size={21} />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
              </div>

              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-sm truncate">
                  Asistente de datos
                </h3>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Costos, inventario, ventas y movimientos
                </p>
              </div>
            </div>

            {/* Acciones de ventana */}
            <div className="flex shrink-0 items-center gap-1 text-slate-500">
              <button
                onClick={handleClearHistory}
                title="Reiniciar conversación y limpiar historial"
                className="p-2 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Limpiar historial"
              >
                <Trash2 size={16} />
              </button>

              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Reducir tamaño' : 'Maximizar'}
                className="hidden sm:block p-2 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Alternar tamaño"
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                title="Cerrar chat"
                className="p-2 rounded-lg hover:bg-rose-50 hover:text-rose-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                aria-label="Cerrar chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Área de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-thin scrollbar-thumb-slate-300">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-200`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 shadow-sm relative group ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : m.error
                        ? 'bg-rose-50 border border-rose-200 text-rose-800 rounded-bl-sm'
                        : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <>
                        <MarkdownText content={m.text} />

                        {/* Botón copiar respuesta */}
                        <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="text-[10px] text-slate-500">
                            {formatTimeChile(m.timestamp)}
                          </span>

                          <button
                            onClick={() => handleCopy(m.id, m.text)}
                            className="flex items-center gap-1 hover:text-blue-700 transition-colors px-1.5 py-0.5 rounded-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            title="Copiar respuesta"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check size={12} className="text-emerald-600" />
                                <span className="text-emerald-700">Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Sugerencias Rápidas al inicio */}
            {messages.length <= 1 && !loading && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <HelpCircle size={13} className="text-blue-600" />
                  Puedes preguntar, por ejemplo:
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTION_CHIPS.map((chip, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(chip)}
                      className="text-left text-xs px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800 transition-colors flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span>{chip}</span>
                      <span className="text-slate-400" aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Indicador de "Pensando / Analizando inventario" */}
            {loading && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-slate-200 max-w-[85%] text-xs text-slate-600">
                <Loader2 size={16} className="animate-spin text-blue-600" />
                <span>Consultando costos, stock, ventas y auditoría...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Formulario de Entrada */}
          <div className="p-3 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={600}
                placeholder="Pregunta costos, stock, ventas o quién movió un producto..."
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none max-h-24 min-h-[42px]"
              />

              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Enviar pregunta"
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 active:scale-[0.98] transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} className="translate-x-0.5" />
                )}
              </button>
            </form>

            <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-500">
              <span className="hidden sm:inline">Presiona Enter para enviar • Shift+Enter para nueva línea</span>
              <span className="sm:hidden">Auditoría con IA en vivo</span>
              <span>Importadora Carlitos ERP</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
