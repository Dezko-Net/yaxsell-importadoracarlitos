'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Loader2, Sparkles, Trash2, RefreshCw, Brain, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react'
import { SEDES, SedeSlug } from '@/types'

// ─── Markdown simple a HTML ──────────────────────────────────────────────────
function simpleMarkdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="font-bold text-sm mt-3 mb-1 text-slate-800">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="font-bold text-base mt-3 mb-1 text-slate-800">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="font-bold text-lg mt-3 mb-1 text-slate-900">$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono text-pink-600">$1</code>')
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1. $2</li>')
  html = html.replace(/\n/g, '<br/>')
  html = html.replace(/(<li[^>]*>.*?<\/li>)<br\/>/g, '$1')
  return html
}

function MarkdownContent({ text }: { text: string }) {
  const html = useMemo(() => simpleMarkdownToHtml(text), [text])
  return <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
}

const todayCL = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

// ─── Sugerencias rápidas ──────────────────────────────────────────────────────
const SUGERENCIAS = [
  { icon: '📊', text: 'Dame un diagnóstico completo del día' },
  { icon: '💰', text: '¿Qué productos debería subir de precio?' },
  { icon: '🚨', text: '¿Hay productos que estoy vendiendo bajo costo?' },
  { icon: '👥', text: '¿Cómo rindieron las cajeras hoy?' },
  { icon: '📈', text: '¿Cómo va la tendencia de ventas esta semana?' },
  { icon: '💸', text: '¿Qué gastos puedo reducir?' },
  { icon: '🎯', text: 'Dame un plan de acción para mañana' },
  { icon: '🔍', text: '¿Qué producto se vendió más veces hoy?' },
]

export default function ContadorIAPage() {
  const [sede, setSede] = useState<SedeSlug>('donbalato-central')
  const [fecha, setFecha] = useState(todayCL())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [analisisRapido, setAnalisisRapido] = useState<string | null>(null)
  const [analisisRapidoLoading, setAnalisisRapidoLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-analisis-productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sede, fecha, accion: 'chat', mensaje: text.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.texto || 'Sin respuesta del Contador IA',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMsg])
    } catch (e: any) {
      const errMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        text: `⚠️ Error: ${e.message || 'No se pudo conectar con el Contador IA'}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleAnalisisRapido = async () => {
    setAnalisisRapidoLoading(true)
    setAnalisisRapido(null)
    try {
      const res = await fetch('/api/ai-analisis-productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sede, fecha, accion: 'analizar' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setAnalisisRapido(data.texto)
    } catch (e: any) {
      setAnalisisRapido(`⚠️ Error: ${e.message || 'No se pudo generar el análisis'}`)
    } finally {
      setAnalisisRapidoLoading(false)
    }
  }

  const limpiarChat = () => {
    setMessages([])
    setAnalisisRapido(null)
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Contador IA</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tu asesor financiero con acceso a todos los datos del ERP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sede}
              onChange={e => setSede(e.target.value as SedeSlug)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            >
              {Object.entries(SEDES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            />
            <button
              onClick={limpiarChat}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition"
              title="Limpiar chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4">
        {/* Análisis rápido */}
        <div className="mb-4">
          <button
            onClick={handleAnalisisRapido}
            disabled={analisisRapidoLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold text-sm transition disabled:opacity-50"
          >
            {analisisRapidoLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Análisis automático del día
              </>
            )}
          </button>

          {analisisRapido && (
            <div className="mt-3 p-4 rounded-xl bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-bold text-purple-700 dark:text-purple-300">Informe del Contador IA</span>
              </div>
              <MarkdownContent text={analisisRapido} />
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Mensajes */}
          <div ref={scrollRef} className="h-[400px] overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !analisisRapido && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white mx-auto mb-4">
                  <Brain className="h-8 w-8" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Hola, soy tu Contador IA</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Tengo acceso a tus ventas, costos, márgenes, cajeras y gastos del día.
                  <br />
                  Pregúntame lo que quieras o usa una sugerencia:
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                  {SUGERENCIAS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s.text)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-slate-200 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200 transition text-left"
                    >
                      <span>{s.icon}</span>
                      <span className="truncate">{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <MarkdownContent text={msg.text} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  )}
                  <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-purple-200' : 'text-slate-400'}`}>
                    {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">El contador está analizando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 dark:border-slate-700 p-3">
            <form
              onSubmit={e => {
                e.preventDefault()
                sendMessage(input)
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Pregúntale al contador IA..."
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white transition disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Info */}
        <div className="mt-4 flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Ventas y márgenes en tiempo real</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Detección de productos bajo costo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            <span>Recomendaciones con impacto $</span>
          </div>
        </div>
      </div>
    </div>
  )
}
