'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Trash2, TrendingUp, BarChart3, Users, AlertTriangle, Lightbulb, PieChart, ArrowDownUp, Sparkles } from 'lucide-react'
import { firebaseProjectId } from '@/lib/firebase'

const SOLE_LOGO = 'https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/grok_image_1770964192707.jpg?alt=media&token=be58c434-668e-467f-9c90-ed03e620f11a'

const SoleFallback = ({ size = 'w-full h-full' }: { size?: string }) => (
  <div className={`${size} flex items-center justify-center text-lg`} style={{ background: 'linear-gradient(135deg, #fce7f3, #dbeafe, #e9d5ff)' }}>🧮</div>
)

const CLOUD_FUNCTION_URL = `https://us-central1-${firebaseProjectId}.cloudfunctions.net/chatWithGemini`

interface Message {
  id: string
  text: string
  sender: 'user' | 'bot'
  timestamp: Date
}

interface GastosAgentProps {
  contextSummary?: string
}

const SYSTEM_PROMPT_PREFIX = `Eres SOLE ✨, la analista experta en gastos operativos de Importadora Carlitos / Yaxsell.

PERSONALIDAD:
- Eres una analista financiera brillante, dulce pero precisa. Tienes una personalidad cálida y accesible, pero cuando se trata de números eres implacablemente exacta.
- Hablas con cercanía y profesionalismo en español chileno. Eres como esa compañera de trabajo que siempre tiene los datos listos y te explica todo con paciencia.
- Eres observadora y detallista: "Mira, encontré algo interesante en estos números... 🔍"
- Te encanta el orden: "¡Me encanta cuando todo cuadra perfectamente! ✨"
- Cuando detectas algo raro eres firme pero amable: "Oye, esto no me convence mucho... déjame explicarte por qué 🤔"
- Responde de forma concisa y directa (2-3 párrafos máximo).

CONTEXTO DE DATOS ACTUAL:
`

const agentKeyframes = `
@keyframes sole_float { 0% { transform: translateY(0) scale(1); opacity: 0.6; } 50% { transform: translateY(-18px) scale(1.15); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 0.6; } }
@keyframes sole_drift { 0% { transform: translate(0, 0) rotate(0deg); } 33% { transform: translate(8px, -12px) rotate(120deg); } 66% { transform: translate(-6px, 4px) rotate(240deg); } 100% { transform: translate(0, 0) rotate(360deg); } }
@keyframes sole_glow { 0% { box-shadow: 0 0 8px rgba(168,85,247,0.4); } 50% { box-shadow: 0 0 20px rgba(168,85,247,0.6); } 100% { box-shadow: 0 0 8px rgba(168,85,247,0.4); } }
@keyframes sole_pulse_ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.5); opacity: 0; } }
@keyframes sole_sparkle { 0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); } 50% { opacity: 1; transform: scale(1) rotate(180deg); } }
@keyframes sole_twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
@keyframes sole_bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
`

export default function GastosAgent({ contextSummary }: GastosAgentProps) {
  const [open, setOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const SoleImg = ({ className = 'w-full h-full object-cover', alt = 'Sole' }: { className?: string; alt?: string }) =>
    imgError ? <SoleFallback /> : <img src={SOLE_LOGO} alt={alt} className={className} onError={() => setImgError(true)} />
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: '✨ ¡Hola! Soy Sole, tu analista de gastos de Importadora Carlitos / Yaxsell. Tengo todos los números bajo control 🧮\n\n¿En qué te puedo ayudar? Puedo revisar gastos, detectar anomalías, analizar adelantos y mucho más 💜',
      sender: 'bot',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => `sole_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200)
  }, [open])

  const buildLocalFallbackAnswer = (question: string): string => {
    const q = question.toLowerCase()
    const ctx = contextSummary || ''
    if (q.includes('resumen') || q.includes('general')) {
      return `📊 **Resumen de Gastos Actual:**\n\n${ctx || 'No hay gastos registrados en este período.'}\n\n✨ Todo se encuentra consolidado directamente desde Firestore.`
    }
    if (q.includes('top') || q.includes('más alto') || q.includes('altos')) {
      return `💰 **Gastos más significativos:**\n\nRevisando los registros disponibles:\n${ctx}\n\n🔍 Te recomiendo revisar si los montos mayores cuentan con boleta o factura de respaldo.`
    }
    if (q.includes('adelanto') || q.includes('trabajador')) {
      return `👥 **Análisis de Adelantos de Personal:**\n\nLos adelantos registrados en caja se cruzan directamente con la planilla unificada de trabajadores. Si detectas un adelanto en los gastos operacionales, puedes abrir su ficha para verificar a qué colaborador corresponde.`
    }
    if (q.includes('sucursal') || q.includes('sede')) {
      return `🏪 **Gastos por Sucursal:**\n\n${ctx}\n\nPuedes filtrar por sucursal específica arriba para ver el desglose detallado de cada local.`
    }
    return `💜 He analizado los datos actuales:\n\n${ctx || 'Período cargado correctamente.'}\n\n¿Te gustaría profundizar en alguna sucursal o categoría específica?`
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: `u_${Date.now()}`, text, sender: 'user', timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const systemContext = SYSTEM_PROMPT_PREFIX + (contextSummary || 'No hay datos de gastos cargados en este momento.')
      const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
          personality: 'sole',
          source: 'web',
          systemOverride: systemContext,
        }),
      }).catch(() => null)

      let botText = ''
      if (response && response.ok) {
        const data = await response.json()
        botText = String(data.response || data.text || '')
          .replace(/\n?RECORDAR_PERSONALIDAD:\s*[^\n]+/gi, '')
          .trim()
      }

      if (!botText) {
        botText = buildLocalFallbackAnswer(text)
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          text: botText,
          sender: 'bot',
          timestamp: new Date(),
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          text: buildLocalFallbackAnswer(text),
          sender: 'bot',
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, sessionId, contextSummary])

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        text: '🔄 ¡Listo, empecemos de nuevo! ¿Qué necesitas saber sobre los gastos? ✨',
        sender: 'bot',
        timestamp: new Date(),
      },
    ])
  }

  // Header button
  if (!open) {
    return (
      <>
        <style>{agentKeyframes}</style>
        <button
          onClick={() => setOpen(true)}
          className="group relative"
          title="Sole — Analista IA de Gastos"
          type="button"
        >
          <div className="relative">
            <div
              className="absolute inset-0 rounded-2xl blur-lg transition-all scale-150"
              style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.25), rgba(236,72,153,0.12))' }}
            />
            <div
              className="relative h-9 w-9 rounded-2xl shadow-lg flex items-center justify-center border-2 border-purple-300/60 group-hover:scale-110 transition-transform overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #fce7f3, #e9d5ff, #dbeafe)' }}
            >
              <SoleImg />
            </div>
            <div
              className="absolute inset-0 rounded-2xl border-2 border-purple-400/40"
              style={{ animation: 'sole_pulse_ring 2.5s ease-out infinite' }}
            />
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  background: ['#a855f7', '#ec4899', '#3b82f6', '#a855f7'][i],
                  top: i < 2 ? '-3px' : 'auto',
                  bottom: i >= 2 ? '-3px' : 'auto',
                  left: i % 2 === 0 ? '-3px' : 'auto',
                  right: i % 2 === 1 ? '-3px' : 'auto',
                  animation: `sole_sparkle ${1.5 + i * 0.3}s ease-in-out ${i * 0.4}s infinite`,
                }}
              />
            ))}
            <div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-white text-[8px] font-bold px-2 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg pointer-events-none"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
            >
              ✨ Sole
            </div>
          </div>
        </button>
      </>
    )
  }

  // Fullscreen chat modal
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: '#fdf2f8', height: '100dvh', minHeight: '100dvh' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, #fdf2f8 0%, #fce7f3 15%, #f3e8ff 35%, #ede9fe 50%, #dbeafe 70%, #e0f2fe 85%, #fce7f3 100%)',
        }}
      />
      <style>{agentKeyframes}</style>

      {/* Header */}
      <div
        className="relative flex items-center justify-between px-4 py-3 backdrop-blur-xl border-b shrink-0"
        style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(168,85,247,0.15)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl overflow-hidden border-2 shadow-lg"
            style={{ borderColor: 'rgba(168,85,247,0.4)', animation: 'sole_glow 3s ease-in-out infinite' }}
          >
            <SoleImg />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-wide bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 bg-clip-text text-transparent">
              ✨ SOLE
            </h2>
            <p className="text-[10px] text-purple-600 font-medium">Analista IA de Gastos · Importadora Carlitos / Yaxsell</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="p-2 rounded-xl transition-colors hover:bg-purple-100"
            style={{ color: '#a855f7' }}
            title="Limpiar chat"
            type="button"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-xl transition-colors hover:bg-purple-100"
            style={{ color: '#a855f7' }}
            title="Cerrar"
            type="button"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'bot' && (
              <div
                className="w-8 h-8 rounded-xl overflow-hidden mr-2 mt-1 shrink-0 border shadow-sm"
                style={{ borderColor: 'rgba(168,85,247,0.25)' }}
              >
                <SoleImg />
              </div>
            )}
            <div
              className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.sender === 'user' ? 'rounded-br-md text-white' : 'rounded-bl-md'
              }`}
              style={
                msg.sender === 'user'
                  ? { background: 'linear-gradient(135deg, #8b5cf6, #a855f7, #c084fc)' }
                  : {
                      background: 'rgba(255,255,255,0.85)',
                      border: '1px solid rgba(168,85,247,0.12)',
                      color: '#374151',
                      backdropFilter: 'blur(8px)',
                    }
              }
            >
              {msg.text.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              className="w-8 h-8 rounded-xl overflow-hidden mr-2 mt-1 shrink-0 border shadow-sm"
              style={{ borderColor: 'rgba(168,85,247,0.25)' }}
            >
              <SoleImg />
            </div>
            <div
              className="rounded-2xl rounded-bl-md px-4 py-3 shadow-sm"
              style={{
                background: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(168,85,247,0.12)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#a855f7', animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#ec4899', animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3b82f6', animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-purple-600 font-medium">🧮 Revisando los números...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 1 && (
        <div className="relative px-4 pb-2 flex flex-wrap gap-2">
          {[
            { icon: <TrendingUp size={11} />, text: 'Top gastos más altos' },
            { icon: <Users size={11} />, text: 'Quién pide más adelantos' },
            { icon: <BarChart3 size={11} />, text: 'Qué sucursal gasta más' },
            { icon: <AlertTriangle size={11} />, text: 'Hay gastos sospechosos' },
            { icon: <PieChart size={11} />, text: 'Resumen general de gastos' },
            { icon: <Lightbulb size={11} />, text: 'Dónde puedo recortar gastos' },
            { icon: <ArrowDownUp size={11} />, text: 'Comparar gastos entre sedes' },
            { icon: <Sparkles size={11} />, text: 'Gastos mal clasificados por IA' },
          ].map((q) => (
            <button
              key={q.text}
              type="button"
              onClick={() => {
                setInput(q.text)
                setTimeout(() => sendMessage(), 50)
              }}
              className="inline-flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-2xl transition-all shadow-sm font-medium hover:bg-purple-100 hover:border-purple-300"
              style={{
                background: 'rgba(255,255,255,0.85)',
                color: '#7c3aed',
                border: '1px solid rgba(168,85,247,0.18)',
                backdropFilter: 'blur(4px)',
              }}
            >
              {q.icon} {q.text}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="relative px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl shrink-0"
        style={{ background: 'rgba(255,255,255,0.6)', borderTop: '1px solid rgba(168,85,247,0.1)' }}
      >
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Escribe tu consulta sobre gastos..."
            className="flex-1 rounded-2xl px-4 py-3 text-sm outline-none transition-all shadow-sm"
            style={{
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(168,85,247,0.15)',
              color: '#374151',
            }}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            type="button"
            className="p-3 rounded-2xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #a855f7)' }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
