'use client'

/**
 * Chat de movimientos de productos para la cajera (solo lectura).
 * Pregunta ej.: "¿cuántas toallas nocturnas Ladysoft 7pcs se vendieron el viernes?"
 * Consume /api/pos/chat-movimientos con el token de sesión de Firebase.
 */

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, Trash2, Loader2, Bot } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { AI_ENABLED } from '@/lib/feature-flags'

interface ChatMsg { role: 'user' | 'assistant'; text: string; error?: boolean }

const SUGGESTIONS = [
  '¿Cuántas toallas nocturnas Ladysoft 7pcs se vendieron desde el viernes?',
  '¿Cuánto stock queda de pastilla limpiadora de lavadora?',
  '¿Qué movimientos tuvo el SKU DB-2H2IQW1V esta semana?',
]

const WELCOME: ChatMsg = {
  role: 'assistant',
  text: 'Hola, soy el asistente de movimientos. Pregúntame cuánto se vendió, ingresó o quedó de un producto en cualquier fecha. Solo veo unidades y stock, no dinero ni clientes.',
}

export default function PosMovimientosChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME])
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading, open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  if (!AI_ENABLED) return null

  async function send(textRaw?: string) {
    const question = (textRaw ?? input).trim()
    if (!question || loading) return
    setInput('')
    const history = messages.filter(m => m !== WELCOME && !m.error).slice(-6).map(m => ({ role: m.role, text: m.text }))
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/pos/chat-movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, history }),
        cache: 'no-store',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No pude responder ahora')
      setMessages(prev => [...prev, { role: 'assistant', text: String(data.answer || '') }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', text: err?.message || 'No pude responder ahora', error: true }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente de movimientos"
          className="fixed bottom-4 left-4 z-[80] flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-emerald-700"
        >
          <MessageCircle size={18} />
          <span className="hidden sm:inline">Consultar movimientos</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 left-4 z-[80] flex h-[min(560px,82vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-emerald-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <div className="leading-tight">
                <div className="text-sm font-bold">Asistente de movimientos</div>
                <div className="text-[11px] opacity-80">Solo lectura &middot; ventas, ingresos y stock</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMessages([WELCOME])} title="Nueva conversaci&oacute;n" className="rounded-lg p-1.5 hover:bg-white/15"><Trash2 size={16} /></button>
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-lg p-1.5 hover:bg-white/15"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    'max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ' +
                    (m.role === 'user'
                      ? 'rounded-br-sm bg-emerald-600 text-white'
                      : m.error
                        ? 'rounded-bl-sm border border-red-200 bg-red-50 text-red-700'
                        : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800')
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}

            {messages.length === 1 && !loading && (
              <div className="flex flex-col gap-2 pt-1">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left text-xs text-emerald-800 hover:bg-emerald-50">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Revisando movimientos&hellip;
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={e => { e.preventDefault(); send() }} className="flex items-center gap-2 border-t border-slate-200 bg-white p-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={500}
              placeholder="Escribe tu pregunta…"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <button type="submit" disabled={loading || input.trim().length < 2} aria-label="Enviar" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white disabled:opacity-40">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
