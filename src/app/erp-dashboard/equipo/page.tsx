'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  fetchTrabajadoresERP,
  createTrabajadorERP,
  deleteTrabajadorERP,
  updateTrabajadorERP,
  normalizeTrabajadorCargos,
  cargoPrincipalTrabajador,
  invalidateTrabajadoresCache,
} from '@/lib/trabajadoresErpService'
import { getServices, MEDIA_BUCKET_ID, getFirebaseConfig, ID } from '@/lib/db'
import { auth, authReady, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Users, Save, Edit, Trash2, Plus, X, Building2, FileText, Download, Bot, Send, Search, Brain, Zap, TrendingUp, TrendingDown, AlertTriangle, Shield, Star, Clock, ArrowLeft, ChevronRight, Sparkles, MessageCircle, BarChart3, Calendar, DollarSign, Award, Heart, ArrowRightLeft, Palette, CheckSquare, Image, Repeat, Eye, Loader2 } from 'lucide-react'
import { SEDES } from '@/types'
import { workerBranchSlugs } from '@/lib/posBranchAccess'
const IS_DEMO_PROJECT = false

const BASE_PLANILLA_SEDES = [
  { id: 'todas', name: 'Todas', color: 'slate', icon: '🌍' },
  { id: 'donbalato-central', name: 'Importadora Carlitos Central', color: 'blue', icon: '🏪' },
] as const

const SEDICONS: Record<string, string> = { 'todas': '🌍', 'donbalato-central': '🏪', 'copiapo': '🏜️', 'alameda': '🌳', 'la-florida': '🌺', 'web': '🌐', 'web-tiendas-3b-chile': '🌐' }
const SEDICOLORS: Record<string, string> = { 'todas': 'slate', 'donbalato-central': 'blue', 'copiapo': 'amber', 'alameda': 'green', 'la-florida': 'pink', 'web': 'indigo', 'web-tiendas-3b-chile': 'indigo' }

// Build sedes from runtime config (SEDES), falling back to hardcoded list
function buildPlanillaSedes() {
  const runtimeKeys = Object.keys(SEDES)
  if (runtimeKeys.length === 0 || (runtimeKeys.length === 1 && runtimeKeys[0] === 'configurar')) {
    return [...BASE_PLANILLA_SEDES]
  }
  return runtimeKeys.map(slug => {
    const match = BASE_PLANILLA_SEDES.find(b => (b.id as string) === slug)
    return match || { id: slug, name: SEDES[slug], color: SEDICOLORS[slug] || 'blue', icon: SEDICONS[slug] || '🏪' }
  })
}

const PLANILLA_SEDES = buildPlanillaSedes()

const DEFAULT_PLANILLA_SEDE = 'todas'
const CARGO_OPTIONS = [
  'CAJERO', 'CAJERA', 'JEFE DE CAJA', 'JEFE DE BODEGA', 'ENCARGADO', 'ENCARGADA',
  'BODEGUERO', 'VENDEDOR', 'VENDEDORA', 'REPONEDOR', 'REPONEDORA', 'CUSTODIA', 'WEB',
]

interface Trabajador {
  id: string
  nombre: string
  nacionalidad: string
  genero: 'HOMBRE' | 'MUJER'
  cargo: string
  cargos: string[]
  sueldo: number
  sede: string
  sedesAdicionales?: string[]
  telefono?: string
  fechaNacimiento?: string
  fotoUrl?: string
  fechaIngreso?: string
  activo?: boolean
  asistencia?: Record<string, 'trabajo' | 'falta' | 'justificado'>
  reportes?: Array<{ id: string; tipo: 'tardanza' | 'descuento' | 'justificacion'; ymd: string; monto?: number; descripcion?: string; creadoEn: number }>
  adelantos?: Array<{ id: string; ymd: string; monto: number; descripcion?: string; creadoEn: number; anulada?: boolean }>
}

function cargosDe(trabajador: Pick<Trabajador, 'cargos' | 'cargo'>): string[] {
  return normalizeTrabajadorCargos(trabajador.cargos, trabajador.cargo)
}

function etiquetaCargos(trabajador: Pick<Trabajador, 'cargos' | 'cargo'>): string {
  return cargosDe(trabajador).join(' · ') || '—'
}

async function mockAiResponse(payload: string): Promise<string> {
  await new Promise(r => setTimeout(r, 600 + Math.random() * 800))
  const lower = payload.toLowerCase()
  if (lower.includes('faltas')) return '📊 Según los registros, las faltas se calculan automáticamente desde la asistencia diaria marcada en el sistema.'
  if (lower.includes('adelanto')) return '💰 Los adelantos se registran por trabajador y se descuentan del neto a pagar en la quincena correspondiente.'
  if (lower.includes('sueldo') || lower.includes('pago')) return '💵 El sueldo base se divide en 2 quincenas. Los descuentos por faltas y adelantos se aplican sobre el acumulado.'
  if (lower.includes('rendimiento')) return '📈 El rendimiento se calcula considerando faltas (-20%), tardanzas (-5%), descuentos (-5%) y adelantos (-3%).'
  if (lower.includes('recuerda')) return '✅ ¡Anotado! Lo guardaré en memoria para futuras consultas.'
  if (lower.includes('apariencia') || lower.includes('ficha')) return '👤 Basándome en el contexto del trabajador, puedo inferir que proyecta una actitud profesional y dedicada. 🎯'
  if (lower.includes('pregunta') || lower.includes('mini-entrevista')) return '¿Cómo ha sido su puntualidad en las últimas dos semanas? ⏰'
  return '🤖 Estoy procesando tu consulta. En Yaxsel, el chat IA completo estará disponible próximamente con integración a Gemini.'
}

export default function PlanillaUnificadaPage() {
  const navigate = useRouter()
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [selectedSede, setSelectedSede] = useState<string>('todas')
  const [dynamicSedes, setDynamicSedes] = useState<Array<{ id: string; name: string; color: string; icon: string }>>([
    { id: 'todas', name: 'Todas', color: 'slate', icon: '🌍' },
    { id: 'donbalato-central', name: 'Importadora Carlitos Central', color: 'blue', icon: '🏪' },
  ])
  const [countsBySede, setCountsBySede] = useState<Record<string, number>>({})

  // Cargar sucursales dinámicas configuradas desde /admin-supreme (Appwrite erp_config)
  useEffect(() => {
    const fetchSedes = async () => {
      try {
        const res = await fetch('/api/admin-supreme/load-config')
        if (res.ok) {
          const json = await res.json()
          if (json.ok && json.data) {
            const parsed = JSON.parse(json.data)
            if (Array.isArray(parsed.branches) && parsed.branches.length > 0) {
              const activeBranches = parsed.branches
                .filter((b: any) => b.active !== false)
                .map((b: any) => ({
                  id: b.slug,
                  name: b.name || String(b.slug).toUpperCase(),
                  color: b.color || 'blue',
                  icon: b.icon || '🏪',
                }))
              if (activeBranches.length > 0) {
                setDynamicSedes([
                  { id: 'todas', name: 'Todas', color: 'slate', icon: '🌍' },
                  ...activeBranches,
                ])
              }
            }
          }
        }
      } catch {
        /* Fallback si falla la red */
      }
    }
    fetchSedes()
  }, [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingCargosId, setSavingCargosId] = useState('')

  const [filtroGenero, setFiltroGenero] = useState<'TODOS' | 'HOMBRE' | 'MUJER'>('TODOS')
  const [filtroNacionalidad, setFiltroNacionalidad] = useState<string>('TODOS')
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'ACTIVOS' | 'INACTIVOS'>('TODOS')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'nombre' | 'neto-asc' | 'neto-desc'>('nombre')
  const [newWorkerOpen, setNewWorkerOpen] = useState(false)
  const [newWorkerSaving, setNewWorkerSaving] = useState(false)
  const [newWorkerError, setNewWorkerError] = useState('')
  const [recentlyCreatedId, setRecentlyCreatedId] = useState<string | null>(null)
  const [newWorker, setNewWorker] = useState({ nombre: '', sede: 'donbalato-central', genero: 'MUJER' as 'HOMBRE' | 'MUJER', nacionalidad: 'CHILENA', cargo: 'CAJERA', sueldo: '600000', fechaIngreso: '' })
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkOverrides, setBulkOverrides] = useState<Record<string, 'trabajo' | 'falta' | 'justificado'>>({})
  const [bulkSaving, setBulkSaving] = useState(false)

  const [manualFeriados, setManualFeriados] = useState<Record<string, string>>({})
  const [informeTrabajador, setInformeTrabajador] = useState<Trabajador | null>(null)

  // Bulk field edit tool
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkEditField, setBulkEditField] = useState<'fechaIngreso' | 'sueldo' | 'cargo' | 'nacionalidad'>('fechaIngreso')
  const [bulkEditValue, setBulkEditValue] = useState('')
  const [bulkEditSelected, setBulkEditSelected] = useState<Set<string>>(new Set())
  const [bulkEditSaving, setBulkEditSaving] = useState(false)

  // Transfer worker modal
  const [transferOpen, setTransferOpen] = useState<Trabajador | null>(null)
  const [transferTarget, setTransferTarget] = useState<string>('')
  const [transferSaving, setTransferSaving] = useState(false)

  // Appearance ficha IA
  const [aparienciaOpen, setAparienciaOpen] = useState<Trabajador | null>(null)
  const [aparienciaText, setAparienciaText] = useState('')
  const [aparienciaLoading, setAparienciaLoading] = useState(false)

  // Ranking IA reasons
  const [rankingReasons, setRankingReasons] = useState<Record<string, string>>({})
  const [rankingReasonsLoading, setRankingReasonsLoading] = useState(false)

  const [uploadingFotoId, setUploadingFotoId] = useState<string | null>(null)

  const [workerAiOpen, setWorkerAiOpen] = useState(false)
  const [workerAiTrabajador, setWorkerAiTrabajador] = useState<Trabajador | null>(null)
  const [workerAiMessages, setWorkerAiMessages] = useState<Array<{ id: string; sender: 'user' | 'bot'; text: string }>>([])
  const [workerAiInput, setWorkerAiInput] = useState('')
  const [workerAiLoading, setWorkerAiLoading] = useState(false)
  const [workerAiMode, setWorkerAiMode] = useState<'menu' | 'preguntar' | 'hablar' | 'mas_datos'>('menu')
  const [adelantosOpen, setAdelantosOpen] = useState(false)
  const [adelantosFrom, setAdelantosFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })
  const [adelantosTo, setAdelantosTo] = useState(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })

  const openWorkerAi = (t: Trabajador) => {
    setWorkerAiTrabajador(t)
    setWorkerAiOpen(true)
    setWorkerAiMode('menu')
    setWorkerAiInput('')
    setWorkerAiMessages([
      {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: `🤖 IA de ${t.nombre || t.id}\n\n¿Qué hacemos? Elige una opción 👇\n\n❓ Preguntar (sueldos, faltas, adelantos, descuentos, etc.)\n💬 Hablar (cuéntame algo y lo guardo en memoria)\n🧠 Dar más datos (te hago preguntas cortas y lo dejo anotado)` ,
      },
    ])
  }

  const adelantosRango = useMemo(() => {
    const from = String(adelantosFrom || '')
    const to = String(adelantosTo || '')
    const hasRange = !!from && !!to
    const out: Array<{ trabajadorId: string; trabajadorNombre: string; adelantoId: string; ymd: string; monto: number; descripcion?: string }> = []

    for (const t of trabajadores) {
      const ads = Array.isArray(t.adelantos) ? t.adelantos : []
      for (const a of ads) {
        if ((a as any)?.anulada) continue
        const ymd = String(a?.ymd || '')
        if (!ymd) continue
        if (hasRange && (ymd < from || ymd > to)) continue
        out.push({
          trabajadorId: t.id,
          trabajadorNombre: t.nombre || t.id,
          adelantoId: a.id,
          ymd,
          monto: Number(a?.monto || 0),
          descripcion: a?.descripcion,
        })
      }
    }

    out.sort((a, b) => {
      if (a.ymd === b.ymd) return b.monto - a.monto
      return b.ymd.localeCompare(a.ymd)
    })
    return out
  }, [trabajadores, adelantosFrom, adelantosTo])

  const totalAdelantosRango = useMemo(() => {
    return adelantosRango.reduce((acc, x) => acc + (Number(x.monto) || 0), 0)
  }, [adelantosRango])

  const eliminarAdelantoRango = async (workerId: string, adelantoId: string) => {
    const ok = window.confirm('¿Eliminar este adelanto?')
    if (!ok) return

    const current = trabajadores.find((t) => t.id === workerId)
    if (!current) return
    const currentAdelantos = Array.isArray(current.adelantos) ? current.adelantos : []
    const nextAdelantos = currentAdelantos.filter((a) => String(a?.id || '') !== String(adelantoId || ''))

    setSaving(true)
    try {
      setTrabajadores((prev) => prev.map((t) => t.id === workerId ? { ...t, adelantos: nextAdelantos } : t))
      await updateTrabajadorERP(workerId, { adelantos: nextAdelantos } as any)
    } finally {
      setSaving(false)
    }
  }

  const workerAiSessionId = (t: Trabajador) => `worker_${t.id}`

  const sendWorkerAiMessage = async (userText: string) => {
    const t = workerAiTrabajador
    if (!t) return

    const clean = String(userText || '').trim()
    if (!clean) return

    const isMemoryCmd = clean.toLowerCase().startsWith('recuerda:')

    setWorkerAiMessages((prev) => [...prev, { id: `u_${Date.now()}`, sender: 'user', text: clean }])
    setWorkerAiInput('')
    setWorkerAiLoading(true)
    try {
      const contextHeader = `[TRABAJADOR_CONTEXT: id=${t.id}; nombre=${t.nombre}; sede=${t.sede}; cargos=${etiquetaCargos(t)}; nacionalidad=${t.nacionalidad}; genero=${t.genero}; sueldo=${t.sueldo}; ingreso=${t.fechaIngreso || ''}; fotoUrl=${t.fotoUrl || ''}]`
      const payload = isMemoryCmd ? clean : `${contextHeader} ${clean}`
      const r = await mockAiResponse(payload)
      setWorkerAiMessages((prev) => [...prev, { id: `b_${Date.now()}`, sender: 'bot', text: r }])
    } finally {
      setWorkerAiLoading(false)
    }
  }

  const startWorkerAiPreguntar = () => {
    setWorkerAiMode('preguntar')
    setWorkerAiMessages((prev) => [
      ...prev,
      { id: `b_${Date.now()}`, sender: 'bot', text: 'Dime qué quieres saber de esta persona (asistencia, sueldo, adelantos, descuentos, etc.).' },
    ])
  }

  const startWorkerAiHablar = () => {
    setWorkerAiMode('hablar')
    setWorkerAiMessages((prev) => [
      ...prev,
      { id: `b_${Date.now()}`, sender: 'bot', text: 'Cuéntame qué me quieres decir sobre esta persona (yo lo guardo como memoria).' },
    ])
  }

  const startWorkerAiMasDatos = () => {
    const t = workerAiTrabajador
    if (!t) return
    setWorkerAiMode('mas_datos')
    setWorkerAiMessages((prev) => [
      ...prev,
      { id: `b_${Date.now()}`, sender: 'bot', text: '🧠 Ya, hagamos una mini-entrevista. Yo pregunto, tú respondes, y lo dejo guardado ✅\n\n(Para salir, escribe: "listo" o "terminar")' },
    ])

    // Primera pregunta dinámica
    void (async () => {
      setWorkerAiLoading(true)
      try {
        const contextHeader = `[TRABAJADOR_CONTEXT: id=${t.id}; nombre=${t.nombre}; sede=${t.sede}; cargos=${etiquetaCargos(t)}; nacionalidad=${t.nacionalidad}; genero=${t.genero}; sueldo=${t.sueldo}; ingreso=${t.fechaIngreso || ''}; fotoUrl=${t.fotoUrl || ''}]`
        const prompt = `${contextHeader} Estamos recopilando información extra del trabajador. Haz 1 sola pregunta corta y concreta, relacionada a su desempeño/asistencia/horarios/rol/comportamiento/observaciones útiles para la tienda. No inventes datos. No hagas listas. Usa 1-2 emojis.`
        const r = await mockAiResponse(prompt)
        setWorkerAiMessages((prev) => [...prev, { id: `b_${Date.now()}_q`, sender: 'bot', text: r }])
      } finally {
        setWorkerAiLoading(false)
      }
    })()
  }

  const handleWorkerAiMasDatosAnswer = async (answer: string) => {
    const t = workerAiTrabajador
    if (!t) return
    const clean = String(answer || '').trim()
    if (!clean) return

    const lower = clean.toLowerCase()
    if (lower === 'listo' || lower === 'terminar' || lower === 'salir' || lower === 'ya') {
      setWorkerAiMode('menu')
      setWorkerAiMessages((prev) => [...prev, { id: `b_${Date.now()}_done`, sender: 'bot', text: 'Listo ✅ Quedó guardado todo lo que me contaste.' }])
      setWorkerAiInput('')
      return
    }

    setWorkerAiMessages((prev) => [...prev, { id: `u_${Date.now()}`, sender: 'user', text: clean }])
    setWorkerAiInput('')
    setWorkerAiLoading(true)

    try {
      const tag = `[TRABAJADOR:${t.id}|${t.nombre || t.id}]`
      await mockAiResponse(`Recuerda: ${tag} ${clean}`)

      const contextHeader = `[TRABAJADOR_CONTEXT: id=${t.id}; nombre=${t.nombre}; sede=${t.sede}; cargos=${etiquetaCargos(t)}; nacionalidad=${t.nacionalidad}; genero=${t.genero}; sueldo=${t.sueldo}; ingreso=${t.fechaIngreso || ''}; fotoUrl=${t.fotoUrl || ''}]`
      const prompt = `${contextHeader} El usuario acaba de aportar nueva información (ya guardada en memoria). Haz la siguiente pregunta, 1 sola, corta y relacionada a lo anterior (follow-up lógico). Si ya hay suficiente, pide confirmación para cerrar diciendo: "¿Listo?". Usa 1-2 emojis. No inventes.`
      const r = await mockAiResponse(prompt)
      setWorkerAiMessages((prev) => [...prev, { id: `b_${Date.now()}_next`, sender: 'bot', text: r }])
    } finally {
      setWorkerAiLoading(false)
    }
  }

  const calcEdad = (fechaNacimiento?: string) => {
    if (!fechaNacimiento) return null
    const d = new Date(fechaNacimiento)
    if (Number.isNaN(d.getTime())) return null
    const now = new Date()
    let age = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
    return age
  }

  const borderClassByGenero = (genero: Trabajador['genero']) => (genero === 'HOMBRE' ? 'border-sky-300' : 'border-pink-200')

  const softBgByGenero = (genero: Trabajador['genero']) => (genero === 'HOMBRE' ? 'bg-sky-50' : 'bg-pink-50')

  const flagByNacionalidad = (nacionalidad?: string) => {
    const n = (nacionalidad || '').toUpperCase()
    if (n.includes('CHILEN')) return '🇨🇱'
    if (n.includes('VENEZOL')) return '🇻🇪'
    if (n.includes('COLOMB')) return '🇨🇴'
    if (n.includes('ECUATOR')) return '🇪🇨'
    if (n.includes('PERU')) return '🇵🇪'
    if (n.includes('ARGENT')) return '🇦🇷'
    if (n.includes('BOLIV')) return '🇧🇴'
    if (n.includes('PARAG')) return '🇵🇾'
    if (n.includes('URUG')) return '🇺🇾'
    return '🌎'
  }

  const generoEmoji = (genero: Trabajador['genero']) => (genero === 'HOMBRE' ? '👨' : '👩')

  const toYmdLocal = (d: Date) => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }



  const easterSunday = (year: number) => {
    const f = Math.floor
    const a = year % 19
    const b = f(year / 100)
    const c = year % 100
    const d = f(b / 4)
    const e = b % 4
    const g = f((8 * b + 13) / 25)
    const h = (19 * a + b - d - g + 15) % 30
    const i = f(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = f((a + 11 * h + 19 * l) / 433)
    const n = f((h + l - 7 * m + 90) / 25)
    const p = (h + l - 7 * m + 33 * n + 19) % 32
    return new Date(year, n - 1, p)
  }

  const chileHolidayName = (date: Date, ymd: string) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const yyyy = d.getFullYear()
    const fixed: Record<string, string> = {
      [`${yyyy}-01-01`]: 'Año Nuevo',
      [`${yyyy}-05-01`]: 'Día del Trabajador',
      [`${yyyy}-05-21`]: 'Glorias Navales',
      [`${yyyy}-06-29`]: 'San Pedro y San Pablo',
      [`${yyyy}-07-16`]: 'Virgen del Carmen',
      [`${yyyy}-08-15`]: 'Asunción',
      [`${yyyy}-09-18`]: 'Independencia',
      [`${yyyy}-09-19`]: 'Glorias del Ejército',
      [`${yyyy}-10-12`]: 'Encuentro de Dos Mundos',
      [`${yyyy}-10-31`]: 'Día de las Iglesias Evangélicas',
      [`${yyyy}-11-01`]: 'Todos los Santos',
      [`${yyyy}-12-08`]: 'Inmaculada Concepción',
      [`${yyyy}-12-25`]: 'Navidad',
    }
    if (fixed[ymd]) return fixed[ymd]

    const easter = easterSunday(yyyy)
    easter.setHours(0, 0, 0, 0)
    const goodFriday = new Date(easter)
    goodFriday.setDate(goodFriday.getDate() - 2)
    const holySaturday = new Date(easter)
    holySaturday.setDate(holySaturday.getDate() - 1)

    const movable: Record<string, string> = {
      [toYmdLocal(goodFriday)]: 'Viernes Santo',
      [toYmdLocal(holySaturday)]: 'Sábado Santo',
    }
    return movable[ymd] || null
  }

  const holidayNameFor = (date: Date, ymd: string) => manualFeriados[ymd] || chileHolidayName(date, ymd)

  const dayAdjust = 20000
  const isSunday = (d: Date) => d.getDay() === 0

  const quincenaBounds = (d: Date) => {
    const yyyy = d.getFullYear()
    const mm = d.getMonth()
    const day = d.getDate()
    const qStart = new Date(yyyy, mm, day <= 15 ? 1 : 16)
    const qEnd = new Date(yyyy, mm, day <= 15 ? 15 : new Date(yyyy, mm + 1, 0).getDate())
    qStart.setHours(0, 0, 0, 0)
    qEnd.setHours(0, 0, 0, 0)
    return { qStart, qEnd }
  }

  const calcAcumuladoQuincenaHastaHoy = (t: Trabajador) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { qStart, qEnd } = quincenaBounds(today)
    const ingreso = t.fechaIngreso ? new Date(t.fechaIngreso) : null
    if (ingreso && !Number.isNaN(ingreso.getTime())) ingreso.setHours(0, 0, 0, 0)
    const rangeStart = ingreso && ingreso > qStart ? ingreso : qStart

    const baseQuincena = Math.round((Number(t.sueldo) || 0) / 2)

    let diasProgramados = 0
    let diasTrabajadosHastaHoy = 0
    let faltasHastaHoy = 0
    let feriadosTrabHastaHoy = 0

    const asistencia = t.asistencia || {}
    const cap = today < qEnd ? today : qEnd

    const getEstado = (ymd: string, date: Date): 'trabajo' | 'falta' | 'justificado' | null => {
      const d0 = new Date(date)
      d0.setHours(0, 0, 0, 0)
      if (isSunday(d0)) return null

      const holiday = holidayNameFor(d0, ymd)
      if (holiday) {
        // En feriado solo cuenta si se marcó explícitamente
        return (asistencia as any)[ymd] || null
      }

      const explicit = (asistencia as any)[ymd]
      if (explicit) return explicit

      // Asistencia automática: sin registro => trabajó (solo dentro del rango válido)
      if (ingreso && d0 < ingreso) return null
      if (d0 > cap) return null
      return 'trabajo'
    }

    for (let d = new Date(rangeStart); d <= qEnd; d.setDate(d.getDate() + 1)) {
      const d0 = new Date(d)
      d0.setHours(0, 0, 0, 0)
      const ymd = toYmdLocal(d0)
      if (isSunday(d0)) continue

      const holiday = holidayNameFor(d0, ymd)
      if (!holiday) diasProgramados++

      if (d0 <= cap) {
        const est = getEstado(ymd, d0)
        if (holiday) {
          if (est === 'trabajo') feriadosTrabHastaHoy++
        } else {
          if (est === 'trabajo') diasTrabajadosHastaHoy++
          if (est === 'falta') faltasHastaHoy++
        }
      }
    }

    const pagoPorDia = diasProgramados > 0 ? Math.round(baseQuincena / diasProgramados) : 0
    const acumuladoBase = pagoPorDia * diasTrabajadosHastaHoy

    const adelantosMonto = (t.adelantos || [])
      .filter((a) => {
        const d = new Date(a.ymd)
        d.setHours(0, 0, 0, 0)
        return d >= qStart && d <= cap
      })
      .reduce((acc, a) => acc + (Number(a.monto) || 0), 0)

    const descuentosExtraMonto = (t.reportes || [])
      .filter((r) => r.tipo === 'descuento')
      .filter((r) => {
        const d = new Date(r.ymd)
        d.setHours(0, 0, 0, 0)
        return d >= qStart && d <= cap
      })
      .reduce((acc, r) => acc + (Number(r.monto) || 0), 0)

    const descuentoFaltas = faltasHastaHoy * dayAdjust
    const bonoFeriado = feriadosTrabHastaHoy * dayAdjust
    const netoAcumulado = acumuladoBase - descuentoFaltas - adelantosMonto - descuentosExtraMonto + bonoFeriado

    const rendimiento = diasProgramados > 0 ? Math.min(100, Math.round((diasTrabajadosHastaHoy / diasProgramados) * 100)) : 0

    return {
      qStart,
      qEnd,
      diasProgramados,
      diasTrabajadosHastaHoy,
      faltasHastaHoy,
      feriadosTrabHastaHoy,
      pagoPorDia,
      acumuladoBase,
      descuentoFaltas,
      bonoFeriado,
      adelantosMonto,
      descuentosExtraMonto,
      netoAcumulado,
      rendimiento,
    }
  }

  const calcPagoQuincena = (t: Trabajador) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { qStart, qEnd } = quincenaBounds(today)
    const ingreso = t.fechaIngreso ? new Date(t.fechaIngreso) : null
    if (ingreso && !Number.isNaN(ingreso.getTime())) ingreso.setHours(0, 0, 0, 0)
    const rangeStart = ingreso && ingreso > qStart ? ingreso : qStart

    const baseQuincena = Math.round((Number(t.sueldo) || 0) / 2)

    let diasProgramados = 0
    let diasTrabajados = 0
    let faltas = 0
    let feriadosTrab = 0

    const asistencia = t.asistencia || {}
    for (let d = new Date(rangeStart); d <= qEnd; d.setDate(d.getDate() + 1)) {
      const d0 = new Date(d)
      d0.setHours(0, 0, 0, 0)
      const ymd = toYmdLocal(d0)
      if (isSunday(d0)) continue

      const holiday = holidayNameFor(d0, ymd)
      if (!holiday) diasProgramados++

      const est = asistencia[ymd]
      if (holiday) {
        if (est === 'trabajo') feriadosTrab++
      } else {
        if (est === 'trabajo') diasTrabajados++
        if (est === 'falta') faltas++
      }
    }

    const pagoPorDia = diasProgramados > 0 ? Math.round(baseQuincena / diasProgramados) : 0

    const adelantosMonto = (t.adelantos || [])
      .filter((a) => {
        const d = new Date(a.ymd)
        d.setHours(0, 0, 0, 0)
        return d >= qStart && d <= qEnd
      })
      .reduce((acc, a) => acc + (Number(a.monto) || 0), 0)

    const descuentosExtraMonto = (t.reportes || [])
      .filter((r) => r.tipo === 'descuento')
      .filter((r) => {
        const d = new Date(r.ymd)
        d.setHours(0, 0, 0, 0)
        return d >= qStart && d <= qEnd
      })
      .reduce((acc, r) => acc + (Number(r.monto) || 0), 0)

    const descuentoFaltas = faltas * dayAdjust
    const bonoFeriado = feriadosTrab * dayAdjust
    const netoPagar = baseQuincena - descuentoFaltas - adelantosMonto - descuentosExtraMonto + bonoFeriado

    return {
      qStart,
      qEnd,
      baseQuincena,
      pagoPorDia,
      diasProgramados,
      diasTrabajados,
      faltas,
      feriadosTrab,
      descuentoFaltas,
      bonoFeriado,
      adelantosMonto,
      descuentosExtraMonto,
      netoPagar,
    }
  }

  const clp = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  const calcRendimiento = (t: Trabajador) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const prefix = `${yyyy}-${mm}-`

    const faltas = Object.entries(t.asistencia || {}).filter(([k, v]) => k.startsWith(prefix) && v === 'falta').length
    const tardanzas = (t.reportes || []).filter((r) => r.tipo === 'tardanza' && r.ymd?.startsWith(`${yyyy}-${mm}-`)).length
    const descuentosCount = (t.reportes || []).filter((r) => r.tipo === 'descuento' && r.ymd?.startsWith(`${yyyy}-${mm}-`)).length
    const adelantosCount = (t.adelantos || []).filter((a) => a.ymd?.startsWith(`${yyyy}-${mm}-`)).length

    return Math.max(0, Math.min(100, 100 - faltas * 20 - tardanzas * 5 - descuentosCount * 5 - adelantosCount * 3))
  }

  const rendimientoColor = (pct: number) => (pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500')

  const todayInfo = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const ymd = toYmdLocal(today)
    const holiday = holidayNameFor(today, ymd)
    const sunday = isSunday(today)
    const laborable = !sunday && !holiday
    return { today, ymd, holiday, sunday, laborable }
  }, [manualFeriados])

  const bulkMarkOpen = () => {
    if (!todayInfo.laborable) {
      if (todayInfo.sunday) {
        alert('Hoy es domingo. No se marca asistencia masiva.')
        return
      }
      if (todayInfo.holiday) {
        alert(`Hoy es feriado (${todayInfo.holiday}). No se marca asistencia masiva.`)
        return
      }
      alert('Hoy no es día laborable.')
      return
    }
    setBulkOverrides({})
    setBulkOpen(true)
  }

  const bulkApply = async () => {
    const firestore = true
    if (!todayInfo.laborable) {
      alert('Hoy no es día laborable. No se aplica la marcación masiva.')
      return
    }

    setBulkSaving(true)
    try {
      const ymd = todayInfo.ymd
      const patches = trabajadores.map((t) => {
        const est = bulkOverrides[t.id] || 'trabajo'
        const asistencia = { ...(t.asistencia || {}), [ymd]: est }
        return { id: t.id, asistencia }
      })

      setTrabajadores((prev) => prev.map((t) => {
        const p = patches.find((x) => x.id === t.id)
        return p ? { ...t, asistencia: p.asistencia } : t
      }))

      await Promise.all(
        patches.map((p) => updateTrabajadorERP(p.id, { asistencia: p.asistencia } as any))
      )

      setBulkOpen(false)
    } catch (e: any) {
      console.error('Error marcando asistencia masiva:', e)
      alert(`No se pudo marcar asistencia masiva: ${e?.message || e}`)
    } finally {
      setBulkSaving(false)
    }
  }

  useEffect(() => {
    // Feriados manuales no disponibles en Yaxsel (Appwrite)
    setManualFeriados({})
  }, [])

  const exportExcelTrabajador = async (t: Trabajador) => {
    try {
      const ExcelJS: any = (await import('exceljs')).default || (await import('exceljs'))
      const { saveAs }: any = await import('file-saver')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Informe')

      const c = {
        header: 'FF0F172A',
        gray: 'FFE2E8F0',
        white: 'FFFFFFFF',
        rose: 'FFFEE2E2',
        orange: 'FFFFEDD5',
        emerald: 'FFDCFCE7',
      }

      ws.columns = [{ width: 22 }, { width: 40 }, { width: 18 }]

      const p = calcPagoQuincena(t)
      ws.mergeCells('A1:C1')
      ws.getCell('A1').value = 'INFORME DE PAGO'
      ws.getCell('A1').font = { bold: true, size: 14, color: { argb: c.white } }
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.header } }
      ws.getRow(1).height = 24

      ws.getRow(2).values = ['TRABAJADOR', t.nombre || t.id, '']
      ws.getRow(3).values = ['SEDE', selectedSede, '']
      ws.getRow(4).values = ['QUINCENA', `${toYmdLocal(p.qStart)} a ${toYmdLocal(p.qEnd)}`, '']
      ws.getRow(6).values = ['BASE QUINCENA', '', p.baseQuincena]
      ws.getRow(7).values = ['NETO A PAGAR', '', p.netoPagar]

      ws.getRow(2).font = { bold: true }
      ws.getRow(3).font = { bold: true }
      ws.getRow(4).font = { bold: true }
      ws.getRow(7).font = { bold: true }

      ws.getRow(9).values = ['DETALLE', 'CONCEPTO', 'MONTO']
      ws.getRow(9).font = { bold: true }
      ws.getRow(9).alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(9).eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.gray } }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      })

      let r = 10
      ws.getRow(r).values = ['Faltas', `${p.faltas} x ${dayAdjust}`, -p.descuentoFaltas]
      ws.getRow(r).getCell(3).font = { color: { argb: 'FF9F1239' }, bold: true }
      ws.getRow(r).eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.rose } }
      })
      r++
      ws.getRow(r).values = ['Adelantos', 'Total', -p.adelantosMonto]
      ws.getRow(r).getCell(3).font = { color: { argb: 'FF9A3412' }, bold: true }
      ws.getRow(r).eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.orange } }
      })
      r++
      ws.getRow(r).values = ['Descuentos extra', 'Total', -p.descuentosExtraMonto]
      ws.getRow(r).getCell(3).font = { color: { argb: 'FF9F1239' }, bold: true }
      ws.getRow(r).eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.rose } }
      })
      r++
      ws.getRow(r).values = ['Bono feriados', `${p.feriadosTrab} x ${dayAdjust}`, p.bonoFeriado]
      ws.getRow(r).getCell(3).font = { color: { argb: 'FF047857' }, bold: true }
      ws.getRow(r).eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.emerald } }
      })
      r++

      for (let i = 1; i <= r; i++) {
        const row = ws.getRow(i)
        row.eachCell((cell: any) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
          cell.alignment = { horizontal: cell.col === 1 ? 'left' : cell.col === 2 ? 'left' : 'center', vertical: 'middle' }
        })
      }
      ws.getColumn(3).numFmt = '"$"#,##0'

      ws.getRow(6).getCell(3).font = { bold: true }
      ws.getRow(7).getCell(3).font = { bold: true, color: { argb: 'FF065F46' } }

      const filename = `INFORME_${(t.nombre || t.id).replace(/\s+/g, '_')}_${toYmdLocal(p.qStart)}_${toYmdLocal(p.qEnd)}.xlsx`
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      saveAs(blob, filename)
    } catch (error: any) {
      console.error('Error exportando informe:', error)
      alert(`Error al exportar: ${error?.message || error}`)
    }
  }

  const exportExcelQuincena = async () => {
    try {
      if (trabajadores.length === 0) {
        alert('No hay trabajadores para exportar.')
        return
      }
      const ExcelJS: any = (await import('exceljs')).default || (await import('exceljs'))
      const { saveAs }: any = await import('file-saver')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Pagos Quincena')

      const c = {
        header: 'FF0F172A',
        gray: 'FFE2E8F0',
        white: 'FFFFFFFF',
      }

      ws.insertRow(1, ['INFORME GENERAL DE PAGOS', '', '', '', '', '', '', '', '', '', ''])
      ws.mergeCells('A1:K1')
      ws.getCell('A1').font = { bold: true, size: 14, color: { argb: c.white } }
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.header } }
      ws.getRow(1).height = 24

      ws.columns = [
        { header: 'Trabajador', key: 'nombre', width: 28 },
        { header: 'Sede', key: 'sede', width: 14 },
        { header: 'Quincena', key: 'quincena', width: 24 },
        { header: 'Base', key: 'base', width: 14 },
        { header: 'Faltas', key: 'faltas', width: 10 },
        { header: 'Desc. faltas', key: 'descFaltas', width: 14 },
        { header: 'Adelantos', key: 'adelantos', width: 14 },
        { header: 'Desc. extra', key: 'descExtra', width: 14 },
        { header: 'Feriados trab', key: 'ferTrab', width: 12 },
        { header: 'Bono feriados', key: 'bonoFer', width: 14 },
        { header: 'Neto a pagar', key: 'neto', width: 16 },
      ]

      // encabezado de columnas (row 2)
      const hdr = ws.getRow(2)
      hdr.font = { bold: true }
      hdr.alignment = { horizontal: 'center', vertical: 'middle' }
      hdr.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.gray } }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { qStart, qEnd } = quincenaBounds(today)
      const quincenaLabel = `${toYmdLocal(qStart)} a ${toYmdLocal(qEnd)}`

      for (const t of trabajadores) {
        const p = calcPagoQuincena(t)
        ws.addRow({
          nombre: t.nombre,
          sede: selectedSede,
          quincena: quincenaLabel,
          base: p.baseQuincena,
          faltas: p.faltas,
          descFaltas: p.descuentoFaltas,
          adelantos: p.adelantosMonto,
          descExtra: p.descuentosExtraMonto,
          ferTrab: p.feriadosTrab,
          bonoFer: p.bonoFeriado,
          neto: p.netoPagar,
        })
      }

      // estilos filas
      ws.eachRow((row: any, rowNumber: number) => {
        if (rowNumber <= 2) return
        row.eachCell((cell: any, col: number) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
          cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' }
        })
      })

      ws.getRow(1).font = { bold: true }
      for (const col of [4, 6, 7, 8, 10, 11]) {
        ws.getColumn(col).numFmt = '"$"#,##0'
      }

      const filename = `PAGOS_QUINCENA_${selectedSede}_${toYmdLocal(qStart)}_${toYmdLocal(qEnd)}.xlsx`
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      saveAs(blob, filename)
    } catch (error: any) {
      console.error('Error exportando quincena:', error)
      alert(`Error al exportar: ${error?.message || error}`)
    }
  }

  const handleUploadFoto = async (trabajadorId: string, file: File) => {
    try {
      const isImage = (file.type || '').toLowerCase().startsWith('image/')
      if (!isImage) {
        alert('Selecciona una imagen válida (JPG/PNG/WebP).')
        return
      }
      const maxMb = 15
      if (file.size > maxMb * 1024 * 1024) {
        alert(`La imagen es muy pesada. Máximo ${maxMb}MB.`)
        return
      }

      setUploadingFotoId(trabajadorId)

      let finalUrl = ''

      // Strategy 1: Upload directo a Firebase Storage Bucket
      try {
        const fileExt = file.name ? file.name.split('.').pop() || 'jpg' : 'jpg'
        const storagePath = `trabajadores/${trabajadorId}_${Date.now()}.${fileExt}`
        const storageRef = ref(storage, storagePath)
        await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' })
        finalUrl = await getDownloadURL(storageRef)
        console.log('[handleUploadFoto] Subida exitosa a Firebase Storage:', finalUrl)
      } catch (storageErr) {
        console.warn('[handleUploadFoto] Error en Firebase Storage, usando compresión canvas fallback:', storageErr)
        // Strategy 2: Compresión Canvas optimizada (sin truncar base64)
        finalUrl = await new Promise<string>((resolve) => {
          const img = new window.Image()
          img.onload = () => {
            const maxDim = 320
            let w = img.width
            let h = img.height
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w)
                w = maxDim
              } else {
                w = Math.round((w * maxDim) / h)
                h = maxDim
              }
            }
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h)
              resolve(canvas.toDataURL('image/jpeg', 0.8))
            } else {
              resolve('')
            }
          }
          img.onerror = () => resolve('')
          img.src = URL.createObjectURL(file)
        })
      }

      if (finalUrl) {
        await handleSave(trabajadorId, 'fotoUrl', finalUrl)
      } else {
        alert('No se pudo procesar la foto.')
      }
    } catch (e: any) {
      console.error('Error subiendo foto:', e)
      const msg = e?.message ? String(e.message) : String(e)
      alert(`No se pudo subir la foto: ${msg}`)
    } finally {
      setUploadingFotoId(null)
    }
  }

  useEffect(() => {
    const cargarTrabajadores = async () => {
      try {
        const items = await fetchTrabajadoresERP()

        // Calcular conteos reales por sede estrictamente desde Appwrite
        const counts: Record<string, number> = {
          'todas': items.length,
        }
        for (const item of items) {
          const s = String(item.sede || '').trim().toLowerCase()
          if (s) {
            counts[s] = (counts[s] || 0) + 1
          }
        }
        setCountsBySede(counts)

        // Mantener la nómina completa en memoria; sede y filtros se aplican localmente.
        const datos: Trabajador[] = items
          .map(t => ({
            id: t.$id,
            nombre: t.nombre,
            nacionalidad: t.nacionalidad || '',
            genero: (t.genero?.toUpperCase() === 'MUJER' || t.genero?.toUpperCase() === 'FEMENINO' ? 'MUJER' : 'HOMBRE') as 'HOMBRE' | 'MUJER',
            cargo: cargoPrincipalTrabajador(t.cargos, t.cargo),
            cargos: normalizeTrabajadorCargos(t.cargos, t.cargo),
            sueldo: Number(t.sueldo) || 0,
            sede: t.sede as any,
            sedesAdicionales: t.sedesAdicionales || [],
            fotoUrl: (t.fotoUrl && !t.fotoUrl.includes('/storage/buckets/')) ? t.fotoUrl : '',
            fechaIngreso: t.fechaIngreso || '',
            activo: t.activo !== false,
            asistencia: t.asistencia || {},
            reportes: t.reportes || [],
            adelantos: t.adelantos || [],
            telefono: t.telefono || '',
          }))
        datos.sort((a, b) => a.nombre.localeCompare(b.nombre))
        setTrabajadores(datos)
      } catch (error) {
        console.error('Error al cargar trabajadores desde Appwrite:', error)
        setTrabajadores([])
      } finally {
        setLoading(false)
      }
    }

    setLoading(true)
    cargarTrabajadores()
  }, [])

  const handleEdit = (id: string) => {
    setEditingId(id)
  }

  const goDetalle = (id: string) => {
    setEditingId(id)
  }

  const recalcCounts = (list: Trabajador[]) => {
    const counts: Record<string, number> = { 'todas': list.length }
    for (const t of list) {
      const s = String(t.sede || '').trim().toLowerCase()
      if (s) {
        counts[s] = (counts[s] || 0) + 1
      }
    }
    setCountsBySede(counts)
  }

  const handleSave = async (id: string, field: keyof Trabajador, value: any) => {
    const currentWorker = trabajadores.find(trabajador => trabajador.id === id)
    const nextCargos = field === 'cargos' ? normalizeTrabajadorCargos(value) : undefined
    const fieldChanges = field === 'cargos' && nextCargos?.length
      ? { cargos: nextCargos, cargo: cargoPrincipalTrabajador(nextCargos) }
      : { [field]: value }
    const updatedTrabajadores = trabajadores.map(trabajador =>
      trabajador.id === id ? { ...trabajador, ...fieldChanges } : trabajador
    )
    setTrabajadores(updatedTrabajadores)
    recalcCounts(updatedTrabajadores)
    
    try {
      const trabajador = updatedTrabajadores.find(t => t.id === id)
      if (trabajador) {
        if (field === 'cargos' && nextCargos?.length) {
          setSavingCargosId(id)
          await authReady
          const token = await auth.currentUser?.getIdToken()
          if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
          const response = await fetch('/api/erp/trabajadores/cargos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ id, cargos: nextCargos }),
          })
          const payload = await response.json().catch(() => null)
          if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudieron actualizar los accesos de los cargos.')
          invalidateTrabajadoresCache()
          return
        }
        const saved = await updateTrabajadorERP(id, field === 'sedesAdicionales' ? {
          sedesAdicionales: trabajador.sedesAdicionales || [],
        } : {
          nombre: trabajador.nombre,
          cargo: cargoPrincipalTrabajador(trabajador.cargos, trabajador.cargo),
          cargos: normalizeTrabajadorCargos(trabajador.cargos, trabajador.cargo),
          sede: trabajador.sede as any,
          sedesAdicionales: trabajador.sedesAdicionales || [],
          sueldo: trabajador.sueldo,
          nacionalidad: trabajador.nacionalidad,
          genero: trabajador.genero,
          fotoUrl: trabajador.fotoUrl || '',
          fechaIngreso: trabajador.fechaIngreso || '',
          telefono: trabajador.telefono || '',
          adelantos: trabajador.adelantos || [],
          asistencia: trabajador.asistencia || {},
          reportes: trabajador.reportes || [],
          activo: trabajador.activo !== false,
        })
        if (!saved) throw new Error('No se pudieron guardar los cambios del trabajador.')
      }
    } catch (error) {
      console.error('Error al guardar trabajador:', error)
      if (currentWorker && (field === 'cargos' || field === 'sedesAdicionales' || field === 'sede')) {
        setTrabajadores(current => current.map(worker => worker.id === id ? (field === 'cargos' ? { ...worker, cargos: currentWorker.cargos, cargo: currentWorker.cargo } : { ...worker, [field]: currentWorker[field] }) : worker))
        alert(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.')
      }
    } finally {
      if (field === 'cargos') setSavingCargosId('')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este trabajador?')) {
      return
    }
    try {
      const deleted = await deleteTrabajadorERP(id)
      if (!deleted) throw new Error('No se pudo eliminar el trabajador.')
      const updatedTrabajadores = trabajadores.filter(trabajador => trabajador.id !== id)
      setTrabajadores(updatedTrabajadores)
      recalcCounts(updatedTrabajadores)
    } catch (error) {
      console.error('Error al eliminar trabajador:', error)
      alert('No se pudo eliminar el trabajador. Intenta nuevamente.')
    }
  }

  const openNewWorker = () => {
    setNewWorker({ nombre: '', sede: selectedSede === 'todas' ? (dynamicSedes.find(s => s.id !== 'todas')?.id || 'donbalato-central') : selectedSede, genero: 'MUJER', nacionalidad: 'CHILENA', cargo: 'CAJERA', sueldo: '600000', fechaIngreso: toYmdLocal(new Date()) })
    setNewWorkerError('')
    setNewWorkerOpen(true)
  }

  const handleAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nombre = newWorker.nombre.trim().replace(/\s+/g, ' ')
    const sueldo = Number(newWorker.sueldo)
    if (!nombre || !newWorker.sede || !newWorker.cargo || !Number.isFinite(sueldo) || sueldo <= 0 || !newWorker.fechaIngreso) {
      setNewWorkerError('Completa nombre, sucursal, cargo, sueldo válido y fecha de ingreso.')
      return
    }
    setNewWorkerSaving(true)
    setNewWorkerError('')
    try {
      const created = await createTrabajadorERP({
        nombre,
        cargo: newWorker.cargo,
        cargos: [newWorker.cargo],
        sede: newWorker.sede as any,
        sedesAdicionales: [],
        sueldo,
        fotoUrl: '',
        activo: true,
        nacionalidad: newWorker.nacionalidad,
        genero: newWorker.genero,
        fechaIngreso: newWorker.fechaIngreso,
      })
      if (!created) throw new Error('No se pudo crear el trabajador. Intenta nuevamente.')
      const nuevoTrabajador: Trabajador = {
        id: created.$id, nombre, sede: newWorker.sede, sedesAdicionales: [], cargo: newWorker.cargo,
        cargos: [newWorker.cargo], sueldo, nacionalidad: newWorker.nacionalidad,
        genero: newWorker.genero, fechaIngreso: newWorker.fechaIngreso, activo: true,
        asistencia: {}, reportes: [], adelantos: [],
      }
      setTrabajadores(prev => [...prev, nuevoTrabajador])
      setCountsBySede(prev => ({ ...prev, todas: (prev.todas || 0) + 1, [newWorker.sede]: (prev[newWorker.sede] || 0) + 1 }))
      setSelectedSede(newWorker.sede)
      setFiltroGenero('TODOS')
      setFiltroNacionalidad('TODOS')
      setFiltroEstado('TODOS')
      setSearchQuery('')
      setRecentlyCreatedId(created.$id)
      setNewWorkerOpen(false)
    } catch (error) {
      setNewWorkerError(error instanceof Error ? error.message : 'No se pudo crear el trabajador.')
    } finally {
      setNewWorkerSaving(false)
    }
  }

  const formatSueldo = (sueldo: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(sueldo)
  }

  const renderCargoEditor = (trabajador: Trabajador) => {
    const selectedCargos = cargosDe(trabajador)
    const cargoOptions = [...CARGO_OPTIONS, ...selectedCargos.filter(role => !CARGO_OPTIONS.some(option => option.toLocaleLowerCase('es') === role.toLocaleLowerCase('es')))]
    return <fieldset disabled={savingCargosId === trabajador.id} className="col-span-full min-w-0 rounded-xl border border-indigo-100 bg-white p-2.5 disabled:opacity-70" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Cargos y accesos</legend>
      <p className="mb-2 text-[10px] leading-snug text-slate-500">Marca todos los cargos que correspondan; se guardan al marcar. Cajero/a y vendedor/a habilitan POS; Web habilita la tienda online. POS-admin sigue dependiendo del nivel asignado.</p>
      <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
        {cargoOptions.map(role => {
          const checked = selectedCargos.some(item => item.toLocaleLowerCase('es') === role.toLocaleLowerCase('es'))
          const roleKey = role.toLocaleLowerCase('es')
          const genderMismatch = (trabajador.genero === 'MUJER' && ['cajero', 'vendedor'].includes(roleKey))
            || (trabajador.genero === 'HOMBRE' && ['cajera', 'vendedora'].includes(roleKey))
          const unavailable = !checked && genderMismatch
          return <label key={role} title={unavailable ? 'Este cargo no corresponde al género seleccionado.' : undefined} className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${unavailable ? 'cursor-not-allowed border-slate-100 bg-slate-50/60 text-slate-300' : 'cursor-pointer'} ${checked ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : !unavailable ? 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white' : ''}`}>
            <input type="checkbox" checked={checked} onChange={(e) => {
              const next = e.target.checked ? [...selectedCargos, role] : selectedCargos.filter(item => item.toLocaleLowerCase('es') !== role.toLocaleLowerCase('es'))
              if (!next.length) return
              const primary = cargoPrincipalTrabajador(next)
              void handleSave(trabajador.id, 'cargos', [primary, ...next.filter(item => item !== primary)])
            }} disabled={unavailable} className="h-3.5 w-3.5 shrink-0 accent-indigo-600" />
            <span className="truncate">{role}</span>
          </label>
        })}
      </div>
    </fieldset>
  }

  const renderBranchEditor = (trabajador: Trabajador) => {
    const allowed = workerBranchSlugs(trabajador)
    return <fieldset className="col-span-2 rounded-xl border border-indigo-100 bg-white p-3" onClick={e => e.stopPropagation()}>
      <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Acceso a sucursales POS</legend>
      <p className="mb-2 text-[11px] text-slate-500">La principal siempre está permitida. Marca otra solo si esta persona trabajará en ambas.</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {dynamicSedes.filter(s => s.id !== 'todas').map(s => {
          const primary = s.id === trabajador.sede
          return <label key={s.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${primary ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            <input type="checkbox" checked={allowed.includes(s.id)} disabled={primary} onChange={e => {
              const next = e.target.checked
                ? [...(trabajador.sedesAdicionales || []), s.id]
                : (trabajador.sedesAdicionales || []).filter(slug => slug !== s.id)
              void handleSave(trabajador.id, 'sedesAdicionales', next)
            }} className="h-4 w-4 accent-indigo-600" />
            <span>{s.icon} {s.name}{primary ? ' · Principal' : ''}</span>
          </label>
        })}
      </div>
    </fieldset>
  }

  const nacionalidadesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const t of trabajadores) {
      if (t.nacionalidad) set.add(t.nacionalidad)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }, [trabajadores])

  const trabajadoresFiltrados = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return trabajadores.filter((t) => {
      if (filtroEstado === 'ACTIVOS' && t.activo === false) return false
      if (filtroEstado === 'INACTIVOS' && t.activo !== false) return false
      if (filtroGenero !== 'TODOS' && t.genero !== filtroGenero) return false
      if (filtroNacionalidad !== 'TODOS' && t.nacionalidad !== filtroNacionalidad) return false
      if (q && !(t.nombre || '').toLowerCase().includes(q)) return false
      if (selectedSede === 'todas' || !selectedSede) return true
      const tSede = String(t.sede || '').trim().toLowerCase()
      const sSede = String(selectedSede).trim().toLowerCase()
      return tSede === sSede
    })
  }, [trabajadores, filtroEstado, filtroGenero, filtroNacionalidad, searchQuery, selectedSede])

  const trabajadoresOrdenados = useMemo(() => {
    const rows = trabajadoresFiltrados.map((t) => ({ t, a: calcAcumuladoQuincenaHastaHoy(t) }))
    rows.sort((x, y) => {
      if (x.t.id === recentlyCreatedId) return -1
      if (y.t.id === recentlyCreatedId) return 1
      if (sortBy === 'neto-asc') return (x.a.netoAcumulado || 0) - (y.a.netoAcumulado || 0)
      if (sortBy === 'neto-desc') return (y.a.netoAcumulado || 0) - (x.a.netoAcumulado || 0)
      return x.t.nombre.localeCompare(y.t.nombre, 'es', { sensitivity: 'base' })
    })
    return rows
  }, [trabajadoresFiltrados, sortBy, recentlyCreatedId])

  const ranking = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const prefix = `${yyyy}-${mm}-`

    const rows = trabajadoresFiltrados.map((t) => {
      const faltas = Object.entries(t.asistencia || {}).filter(([k, v]) => k.startsWith(prefix) && v === 'falta').length
      const tardanzas = (t.reportes || []).filter((r) => r.tipo === 'tardanza' && r.ymd?.startsWith(prefix)).length
      const descuentos = (t.reportes || []).filter((r) => r.tipo === 'descuento' && r.ymd?.startsWith(prefix)).length
      const adelantos = (t.adelantos || []).filter((a) => a.ymd?.startsWith(prefix)).length
      const montoAdelantos = (t.adelantos || []).filter((a) => a.ymd?.startsWith(prefix)).reduce((s, a) => s + (Number(a.monto) || 0), 0)
      const pct = Math.max(0, Math.min(100, 100 - faltas * 20 - tardanzas * 5 - descuentos * 5 - adelantos * 3))
      const reasons: string[] = []
      // Always show complete breakdown
      reasons.push(`${faltas} falta${faltas !== 1 ? 's' : ''}`)
      reasons.push(`${tardanzas} tardanza${tardanzas !== 1 ? 's' : ''}`)
      if (descuentos > 0) reasons.push(`${descuentos} desc.`)
      reasons.push(`${adelantos} adelanto${adelantos !== 1 ? 's' : ''}${montoAdelantos > 0 ? ` ($${Math.round(montoAdelantos / 1000)}k)` : ''}`)
      return { t, pct, reasons }
    }).sort((a, b) => b.pct - a.pct)

    return {
      top: rows.slice(0, 5),
      low: rows.filter(r => r.pct < 100).slice(-5).reverse(),
    }
  }, [trabajadoresFiltrados])

  const totalSueldos = trabajadoresFiltrados.reduce((sum, trabajador) => sum + trabajador.sueldo, 0)

  const totalAPagarHoy = useMemo(() => {
    return trabajadoresFiltrados.reduce((acc, t) => acc + (calcAcumuladoQuincenaHastaHoy(t).netoAcumulado || 0), 0)
  }, [trabajadoresFiltrados])

  const [globalAiOpen, setGlobalAiOpen] = useState(false)
  const [globalAiMessages, setGlobalAiMessages] = useState<Array<{ id: string; sender: 'user' | 'bot'; text: string }>>([])
  const [globalAiInput, setGlobalAiInput] = useState('')
  const [globalAiLoading, setGlobalAiLoading] = useState(false)
  const globalAiScrollRef = useRef<HTMLDivElement | null>(null)

  const globalAiIconUrl = 'https://cdn-icons-png.flaticon.com/512/8943/8943377.png'

  const globalAiSessionId = useMemo(() => {
    return `planilla_trabajadores_${selectedSede}`
  }, [selectedSede])

  const openGlobalAi = () => {
    setGlobalAiOpen(true)
    setGlobalAiInput('')
    setGlobalAiMessages([
      {
        id: `b_${Date.now()}`,
        sender: 'bot',
        text: '🤖 Chat IA (Trabajadores)\n\nPregúntame lo que sea sobre: faltas, acumulados, pagos, adelantos, descuentos, etc. 💸\n\nTip: di la sede si quieres algo específico (Copiapó / Alameda / La Florida).',
      }
    ])
  }

  useEffect(() => {
    if (!globalAiOpen) return
    const el = globalAiScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [globalAiOpen, globalAiMessages, globalAiLoading])

  const sendGlobalAi = async (userText: string) => {
    const clean = String(userText || '').trim()
    if (!clean) return

    setGlobalAiMessages((prev) => [...prev, { id: `u_${Date.now()}`, sender: 'user', text: clean }])
    setGlobalAiInput('')
    setGlobalAiLoading(true)

    try {
      const top = trabajadoresOrdenados.slice(0, 80).map(({ t, a }) => {
        const nombre = String(t.nombre || t.id)
        const sede = String(t.sede)
        const faltas = Number(a.faltasHastaHoy) || 0
        const acum = Number(a.netoAcumulado) || 0
        return `- ${nombre} (${sede}) faltas=${faltas} acumulado=${acum}`
      }).join('\n')

      const contextHeader = `PLANILLA_TRABAJADORES_CONTEXT\nSedeActual=${selectedSede}\nTotalAPagarHoy=${totalAPagarHoy}\nTrabajadores(${Math.min(80, trabajadoresOrdenados.length)}):\n${top}`
      const payload = `${contextHeader}\n\nUSUARIO: ${clean}`

      const r = await mockAiResponse(payload)
      setGlobalAiMessages((prev) => [...prev, { id: `b_${Date.now()}`, sender: 'bot', text: r }])
    } finally {
      setGlobalAiLoading(false)
    }
  }

  // ── Transfer worker to another sede ──
  const doTransfer = async () => {
    if (!transferOpen || !transferTarget) return
    setTransferSaving(true)
    try {
      const newSede = transferTarget as Trabajador['sede']
      await updateTrabajadorERP(transferOpen.id, { sede: newSede as any })
      setTrabajadores(prev => prev.map(t => t.id === transferOpen.id ? { ...t, sede: newSede } : t))
      setCountsBySede(prev => ({
        ...prev,
        [transferOpen.sede]: Math.max(0, (prev[transferOpen.sede] || 0) - 1),
        [newSede]: (prev[newSede as keyof typeof prev] || 0) + 1,
      }))
      setTransferOpen(null)
      setTransferTarget('')
    } catch (e: any) {
      alert(`Error: ${e?.message || e}`)
    } finally {
      setTransferSaving(false)
    }
  }

  // ── Bulk field edit — apply same value to selected workers ──
  const doBulkFieldEdit = async () => {
    if (bulkEditSelected.size === 0 || !bulkEditValue.trim()) return
    setBulkEditSaving(true)
    try {
      const val = bulkEditField === 'sueldo' ? Number(bulkEditValue) : bulkEditValue.trim()
      const ids = Array.from(bulkEditSelected)
      if (bulkEditField === 'cargo') {
        await authReady
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
        const responses = await Promise.all(ids.map(id => fetch('/api/erp/trabajadores/cargos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id, cargos: [val] }),
        })))
        const payloads = await Promise.all(responses.map(response => response.json().catch(() => null)))
        const failed = payloads.find((payload, index) => !responses[index].ok || !payload?.ok)
        if (failed) throw new Error(failed?.error || 'No se pudieron guardar los cargos seleccionados.')
        invalidateTrabajadoresCache()
        setTrabajadores(prev => prev.map(t => bulkEditSelected.has(t.id) ? { ...t, cargo: String(val), cargos: [String(val)] } : t))
      } else {
        await Promise.all(ids.map(id => updateTrabajadorERP(id, { [bulkEditField]: val } as any)))
        setTrabajadores(prev => prev.map(t => bulkEditSelected.has(t.id) ? { ...t, [bulkEditField]: val } as any : t))
      }
      setBulkEditOpen(false)
      setBulkEditSelected(new Set())
      setBulkEditValue('')
    } catch (e: any) {
      alert(`Error: ${e?.message || e}`)
    } finally {
      setBulkEditSaving(false)
    }
  }

  // ── Appearance ficha IA — analyze worker photo ──
  const genApariencia = async (t: Trabajador) => {
    setAparienciaOpen(t)
    setAparienciaText('')
    setAparienciaLoading(true)
    try {
      const prompt = `Analiza la foto de perfil de este trabajador y genera una ficha de apariencia detallada en español chileno con personalidad divertida.

TRABAJADOR: ${t.nombre || t.id}
FOTO_URL: ${t.fotoUrl || '(sin foto)'}
GÉNERO: ${t.genero}
CARGOS: ${etiquetaCargos(t)}
SEDE: ${t.sede}

INSTRUCCIONES:
- Si hay foto URL, describe la apariencia basándote en lo que puedas inferir del contexto y nombre.
- Incluye: complexión estimada, estilo, actitud que proyecta, primera impresión, look general.
- Si NO hay foto, inventa una descripción graciosa basada en el nombre y cargo.
- Usa emojis, sé creativo y divertido pero respetuoso.
- Formato: párrafos cortos, máximo 6 líneas.
- NO uses markdown, solo texto plano con emojis.`

      const r = await mockAiResponse(prompt)
      setAparienciaText(r)
    } catch {
      setAparienciaText('Error al generar la ficha de apariencia 😅')
    } finally {
      setAparienciaLoading(false)
    }
  }

  const sedes = dynamicSedes

  const sedeUi: Record<string, { selected: string; base: string }> = {
    'donbalato-central': { selected: 'border-blue-500 bg-blue-50', base: 'border-blue-200 hover:border-blue-300' },
    'copiapo': { selected: 'border-amber-500 bg-amber-50', base: 'border-amber-200 hover:border-amber-300' },
    'alameda': { selected: 'border-green-500 bg-green-50', base: 'border-green-200 hover:border-green-300' },
    'la-florida': { selected: 'border-pink-500 bg-pink-50', base: 'border-pink-200 hover:border-pink-300' },
    'web': { selected: 'border-indigo-500 bg-indigo-50', base: 'border-indigo-200 hover:border-indigo-300' },
  }

  const currentSede = sedes.find(s => s.id === selectedSede) || sedes[0] || { id: 'configurar', name: 'Configurar', color: 'blue', icon: '⚙️' }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando planilla de trabajadores...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <style>{`
        @keyframes pu_float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes pu_pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes pu_shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes pu_wave { 0%{transform:translateX(0)} 50%{transform:translateX(-25%)} 100%{transform:translateX(0)} }
        @keyframes pu_glow { 0%,100%{box-shadow:0 0 8px rgba(99,102,241,0.15)} 50%{box-shadow:0 0 16px rgba(99,102,241,0.3)} }
      `}</style>

      {/* ═══════════ STICKY HEADER — AppBar Refinado ═══════════ */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800">
        <div className="px-4 py-3 max-w-[1400px] mx-auto flex items-center gap-3">
          <button onClick={() => navigate.push('/erp-dashboard')} aria-label="Volver al panel" className="h-9 w-9 shrink-0 grid place-content-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
            <ArrowLeft size={16} className="text-slate-600" />
          </button>
          <div className="hidden sm:grid h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 place-content-center text-white shadow-md shadow-indigo-500/25">
            <Users size={16} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-bold text-slate-800 truncate">Planilla de trabajadores</h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                {currentSede.icon} {currentSede.name}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{trabajadoresFiltrados.length} visibles · {todayInfo.laborable ? todayInfo.ymd : (todayInfo.sunday ? '🚫 Domingo' : `🚫 ${todayInfo.holiday || 'No laborable'}`)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => searchInputRef.current?.focus()} className="h-9 w-9 grid place-content-center rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95" aria-label="Buscar trabajadores">
              <Search size={15} />
            </button>
            <button onClick={() => setAdelantosOpen(true)} className="hidden sm:grid h-9 w-9 place-content-center rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95 transition-all" title="Adelantos por rango">
              <DollarSign size={15} />
            </button>
            <button onClick={openNewWorker} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all">
              <Plus size={14} strokeWidth={2.5} /> <span>Nuevo</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-8 pt-4">

        {/* Botón flotante + Chat IA general (Trabajadores) */}
        <button
          type="button"
          onClick={openGlobalAi}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-40 h-14 w-14 rounded-2xl shadow-xl border border-indigo-200 bg-gradient-to-br from-indigo-500 to-violet-500 grid place-content-center hover:shadow-2xl active:scale-95 transition-all"
          style={{ animation: 'pu_glow 3s ease-in-out infinite' }}
          title="Chat IA (Trabajadores)"
        >
          <Brain size={22} className="text-white" />
        </button>

        {globalAiOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-3 z-50" onClick={() => setGlobalAiOpen(false)}>
            <div
              className="w-full max-w-xl h-[78vh] sm:h-[72vh] rounded-3xl bg-white border border-gray-200 shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-cyan-500 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-2xl bg-white/15 border border-white/20 grid place-content-center overflow-hidden">
                      <img src={globalAiIconUrl} alt="IA" className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold truncate">Chat IA · Trabajadores</div>
                      <div className="text-[11px] text-white/90 truncate">Sede: {selectedSede} · Total hoy: {formatSueldo(totalAPagarHoy)}</div>
                    </div>
                  </div>

                  <button
                    className="h-9 w-9 rounded-2xl bg-white/15 border border-white/20 grid place-content-center hover:bg-white/20"
                    onClick={() => setGlobalAiOpen(false)}
                    title="Cerrar"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div ref={globalAiScrollRef} className="flex-1 px-3 py-4 overflow-auto bg-slate-50">
                <div className="space-y-3">
                  {globalAiMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.sender === 'bot' && (
                        <div className="mr-2 mt-0.5 h-8 w-8 rounded-2xl bg-white border border-slate-200 grid place-content-center overflow-hidden shrink-0">
                          <img src={globalAiIconUrl} alt="IA" className="h-5 w-5" />
                        </div>
                      )}
                      <div
                        className={
                          m.sender === 'user'
                            ? 'max-w-[82%] rounded-3xl rounded-br-lg bg-indigo-600 text-white px-4 py-2 text-sm shadow-sm whitespace-pre-wrap'
                            : 'max-w-[82%] rounded-3xl rounded-bl-lg bg-white text-slate-900 px-4 py-2 text-sm border border-slate-200 shadow-sm whitespace-pre-wrap'
                        }
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}

                  {globalAiLoading && (
                    <div className="flex justify-start">
                      <div className="mr-2 mt-0.5 h-8 w-8 rounded-2xl bg-white border border-slate-200 grid place-content-center overflow-hidden shrink-0">
                        <img src={globalAiIconUrl} alt="IA" className="h-5 w-5" />
                      </div>
                      <div className="rounded-3xl rounded-bl-lg bg-white text-slate-700 px-4 py-2 text-sm border border-slate-200 shadow-sm">
                        Escribiendo…
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-gray-200 bg-white">
                <div className="flex items-end gap-2">
                  <textarea
                    value={globalAiInput}
                    onChange={(e) => setGlobalAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void sendGlobalAi(globalAiInput)
                      }
                    }}
                    rows={1}
                    className="flex-1 resize-none px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 min-h-[48px] max-h-32"
                    placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para salto)"
                    disabled={globalAiLoading}
                  />
                  <button
                    className="h-12 w-12 rounded-2xl bg-indigo-600 text-white grid place-content-center disabled:opacity-50 shadow-sm"
                    disabled={globalAiLoading || !globalAiInput.trim()}
                    onClick={() => void sendGlobalAi(globalAiInput)}
                    title="Enviar"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ Sede Selector — Pills refinados ═══════════ */}
        <div className="mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {sedes.map((sede) => {
              const active = selectedSede === sede.id
              const count = countsBySede[sede.id] ?? 0
              const sedeGradients: Record<string, string> = {
                'todas': 'from-blue-600 via-indigo-600 to-purple-600',
                'donbalato-central': 'from-blue-600 to-indigo-600',
                'chacabuco-08': 'from-emerald-600 to-teal-600',
                'copiapo': 'from-amber-500 to-orange-500',
                'alameda': 'from-emerald-500 to-teal-600',
                'la-florida': 'from-pink-500 to-rose-600',
                'web': 'from-indigo-500 to-violet-600',
              }
              const accent = sedeGradients[sede.id] || 'from-blue-600 to-indigo-600'
              return (
                <button
                  key={sede.id}
                  onClick={() => setSelectedSede(sede.id as any)}
                  className={`group relative shrink-0 px-3.5 py-2.5 rounded-xl border transition-all active:scale-[0.97] ${
                    active
                      ? 'border-transparent text-white shadow-md bg-gradient-to-br ' + accent
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`h-8 w-8 rounded-lg grid place-content-center text-lg ${active ? 'bg-white/20 backdrop-blur-sm' : 'bg-slate-50 group-hover:bg-slate-100'}`}>
                      {sede.icon}
                    </div>
                    <div className="text-left">
                      <p className={`text-xs font-bold leading-tight ${active ? 'text-white' : 'text-slate-800'}`}>{sede.name}</p>
                      <p className={`text-[10px] font-medium mt-0.5 ${active ? 'text-white/80' : 'text-slate-400'}`}>{count} {count === 1 ? 'persona' : 'personas'}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <section aria-label="Buscar y filtrar trabajadores" className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="block min-w-0 flex-1 text-[11px] font-bold text-slate-600">
              Buscar personal
              <span className="relative mt-1 block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Nombre del trabajador" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-200"><X size={15} /></button>}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[680px]">
              <label className="min-w-0 text-[11px] font-bold text-slate-600">Nacionalidad
                <select value={filtroNacionalidad} onChange={e => setFiltroNacionalidad(e.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none">
                  <option value="TODOS">Todas</option>
                  {nacionalidadesDisponibles.map(n => <option key={n} value={n}>{flagByNacionalidad(n)} {n}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-[11px] font-bold text-slate-600">Género
                <select value={filtroGenero} onChange={e => setFiltroGenero(e.target.value as 'TODOS' | 'HOMBRE' | 'MUJER')} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none">
                  <option value="TODOS">Todos</option><option value="HOMBRE">Hombres</option><option value="MUJER">Mujeres</option>
                </select>
              </label>
              <label className="min-w-0 text-[11px] font-bold text-slate-600">Estado
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as typeof filtroEstado)} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none">
                  <option value="TODOS">Todos</option><option value="ACTIVOS">Activos</option><option value="INACTIVOS">Inactivos</option>
                </select>
              </label>
              <label className="min-w-0 text-[11px] font-bold text-slate-600">Ordenar por
                <select value={sortBy} onChange={e => { setSortBy(e.target.value as typeof sortBy); setRecentlyCreatedId(null) }} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none">
                  <option value="nombre">Nombre A–Z</option><option value="neto-desc">Neto mayor</option><option value="neto-asc">Neto menor</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{trabajadoresFiltrados.length} de {trabajadores.length} trabajadores · {currentSede.name}</span>
            {(searchQuery || filtroGenero !== 'TODOS' || filtroNacionalidad !== 'TODOS' || filtroEstado !== 'TODOS' || sortBy !== 'nombre') && <button type="button" onClick={() => { setSearchQuery(''); setFiltroGenero('TODOS'); setFiltroNacionalidad('TODOS'); setFiltroEstado('TODOS'); setSortBy('nombre'); setRecentlyCreatedId(null) }} className="font-bold text-indigo-600 hover:text-indigo-800">Limpiar filtros</button>}
          </div>
        </section>

        {/* ═══════════ Stats Dashboard ═══════════ */}
        <div className="mb-4 space-y-3">
          {/* Hero: Composición de equipo — Donut + Avatares reales + Glass White */}
          {(() => {
            const mujeresArr = trabajadoresFiltrados.filter(t => {
              const g = (t.genero || '').toUpperCase()
              return g === 'MUJER' || g === 'FEMENINO'
            })
            const hombresArr = trabajadoresFiltrados.filter(t => {
              const g = (t.genero || '').toUpperCase()
              return g !== 'MUJER' && g !== 'FEMENINO'
            })
            const mujeres = mujeresArr.length
            const hombres = hombresArr.length
            const total = trabajadoresFiltrados.length
            const hPct = total > 0 ? Math.round((hombres / total) * 100) : 0
            const mPct = total > 0 ? Math.round((mujeres / total) * 100) : 0
            // Donut math
            const R = 36
            const C = 2 * Math.PI * R
            const mLen = (mPct / 100) * C
            const hLen = (hPct / 100) * C
            return (
              <div className="relative rounded-2xl overflow-hidden bg-white/70 backdrop-blur-xl border border-white/60 shadow-lg shadow-slate-200/50">
                {/* Gradient orbs sutil */}
                <div className="absolute -top-16 -left-16 h-40 w-40 rounded-full bg-pink-400/20 blur-2xl" style={{ animation: 'pu_float 6s ease-in-out infinite' }} />
                <div className="absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-sky-400/20 blur-2xl" style={{ animation: 'pu_float 7s ease-in-out infinite reverse' }} />
                {/* Grid pattern */}
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#64748b 1px, transparent 1px), linear-gradient(90deg, #64748b 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                <div className="relative z-10 p-4 flex items-center gap-4">
                  {/* ═══ DONUT SVG ═══ */}
                  <div className="relative shrink-0 h-24 w-24">
                    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
                      <defs>
                        <linearGradient id="gradM" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f472b6" />
                          <stop offset="100%" stopColor="#e11d48" />
                        </linearGradient>
                        <linearGradient id="gradH" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>
                      </defs>
                      <circle cx="50" cy="50" r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
                      <circle cx="50" cy="50" r={R} fill="none" stroke="url(#gradM)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${mLen} ${C - mLen}`} className="transition-all duration-1000 ease-out" />
                      <circle cx="50" cy="50" r={R} fill="none" stroke="url(#gradH)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${hLen} ${C - hLen}`} strokeDashoffset={-mLen} className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-800 leading-none tabular-nums">{total}</span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Total</span>
                    </div>
                  </div>

                  {/* ═══ Stats verticales ═══ */}
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {/* Mujeres */}
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-pink-400 shadow-sm" />
                        <span className="text-[10px] font-bold text-pink-600 uppercase tracking-wider">Mujeres</span>
                        <span className="text-[10px] font-black text-slate-800 ml-auto tabular-nums">{mujeres}<span className="text-slate-400 font-medium"> · {mPct}%</span></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5">
                          {mujeresArr.slice(0, 5).map((t, i) => (
                            <div key={t.id} className="relative h-5 w-5 rounded-full ring-2 ring-white overflow-hidden bg-gradient-to-br from-pink-400 to-rose-600 shrink-0" style={{ zIndex: 10 - i }}>
                              <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white select-none">
                                {(t.nombre || '?')[0]?.toUpperCase()}
                              </div>
                              {t.fotoUrl ? (
                                <img
                                  src={t.fotoUrl}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                              ) : null}
                            </div>
                          ))}
                          {mujeres > 5 && <div className="h-5 w-5 rounded-full ring-2 ring-white bg-pink-100 text-[8px] font-black text-pink-600 grid place-content-center">+{mujeres - 5}</div>}
                        </div>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden ml-1">
                          <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500 transition-all duration-1000" style={{ width: `${mPct}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Hombres */}
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-sm" />
                        <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">Hombres</span>
                        <span className="text-[10px] font-black text-slate-800 ml-auto tabular-nums">{hombres}<span className="text-slate-400 font-medium"> · {hPct}%</span></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5">
                          {hombresArr.slice(0, 5).map((t, i) => (
                            <div key={t.id} className="relative h-5 w-5 rounded-full ring-2 ring-white overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600 shrink-0" style={{ zIndex: 10 - i }}>
                              <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white select-none">
                                {(t.nombre || '?')[0]?.toUpperCase()}
                              </div>
                              {t.fotoUrl ? (
                                <img
                                  src={t.fotoUrl}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                              ) : null}
                            </div>
                          ))}
                          {hombres > 5 && <div className="h-5 w-5 rounded-full ring-2 ring-white bg-sky-100 text-[8px] font-black text-sky-600 grid place-content-center">+{hombres - 5}</div>}
                        </div>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden ml-1">
                          <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-1000" style={{ width: `${hPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Badge lateral */}
                  <div className="hidden sm:flex flex-col items-center gap-1 shrink-0 pl-3 border-l border-slate-200">
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-content-center shadow-md">
                      <Users size={14} className="text-white" strokeWidth={2.5} />
                    </div>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Equipo</span>
                    <span className="text-[9px] font-black text-slate-700 tabular-nums">{currentSede.name}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Acumulado + Sueldo + Rendimiento row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className={`relative rounded-xl p-3 overflow-hidden shadow-sm ${totalAPagarHoy >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={12} className="text-white/70" strokeWidth={2.5} />
                <p className="text-[9px] font-bold text-white/80 uppercase tracking-wider">Acumulado</p>
              </div>
              <p className="text-base font-black text-white leading-none">{formatSueldo(totalAPagarHoy)}</p>
              <p className="text-[9px] text-white/70 font-medium mt-1">Quincena en curso</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={12} className="text-slate-400" strokeWidth={2.5} />
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Mensual</p>
              </div>
              <p className="text-base font-black text-slate-800 leading-none">{formatSueldo(trabajadoresFiltrados.reduce((s, t) => s + (Number(t.sueldo) || 0), 0))}</p>
              <p className="text-[9px] text-slate-400 font-medium mt-1">Quinc: {formatSueldo(Math.round(trabajadoresFiltrados.reduce((s, t) => s + (Number(t.sueldo) || 0), 0) / 2))}</p>
            </div>
            {(() => {
              const avgRend = trabajadoresFiltrados.length > 0 ? Math.round(trabajadoresFiltrados.reduce((s, t) => s + calcRendimiento(t), 0) / trabajadoresFiltrados.length) : 0
              const rendColor = avgRend >= 80 ? 'emerald' : avgRend >= 60 ? 'amber' : 'red'
              return (
                <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp size={12} className="text-slate-400" strokeWidth={2.5} />
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Rendimiento</p>
                  </div>
                  <p className={`text-base font-black leading-none text-${rendColor}-600`}>{avgRend}%</p>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${avgRend >= 80 ? 'from-emerald-400 to-teal-500' : avgRend >= 60 ? 'from-amber-400 to-orange-500' : 'from-red-400 to-rose-500'}`} style={{ width: `${avgRend}%` }} />
                  </div>
                </div>
              )
            })()}
          </div>

          {/* IA Tools row — botones refinados */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => { setBulkEditOpen(true); setBulkEditSelected(new Set()); setBulkEditValue('') }} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold shadow-sm hover:border-slate-300 hover:shadow-md active:scale-95 transition-all">
              <CheckSquare size={13} className="text-slate-500" /> Editar masivo
            </button>
            <button onClick={() => bulkMarkOpen()} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-emerald-200 text-emerald-700 text-[11px] font-semibold shadow-sm hover:border-emerald-300 hover:bg-emerald-50 active:scale-95 transition-all">
              <Calendar size={13} /> Asistencia
            </button>
            <button onClick={() => setAdelantosOpen(true)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-[11px] font-semibold shadow-sm hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 transition-all">
              <FileText size={13} /> Informe sueldos
            </button>
            <button onClick={() => void exportExcelQuincena()} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-amber-200 text-amber-700 text-[11px] font-semibold shadow-sm hover:border-amber-300 hover:bg-amber-50 active:scale-95 transition-all">
              <Download size={13} /> Exportar quincena
            </button>
            <button onClick={openGlobalAi} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-[11px] font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all">
              <Brain size={13} /> Chat IA
            </button>
          </div>

          {/* Ranking cards — Top 5 with reasons */}
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50/50 p-3 relative overflow-hidden">
              <div className="flex items-center gap-1.5 mb-2">
                <Award size={12} className="text-emerald-600" />
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Top 5 — Mejor rendimiento</p>
              </div>
              <div className="space-y-1.5">
                {ranking.top.length === 0 ? (
                  <p className="text-[10px] text-emerald-600/60">—</p>
                ) : ranking.top.map(({ t, pct, reasons }, i) => (
                  <div key={t.id} className="flex items-start gap-2 bg-white/60 rounded-xl px-2.5 py-1.5 border border-emerald-100">
                    <span className="text-sm mt-0.5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i === 3 ? '4️⃣' : '5️⃣'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-emerald-900 font-bold truncate">{t.nombre || t.id}</span>
                        <span className="text-[11px] font-black text-emerald-700 shrink-0">{pct}%</span>
                      </div>
                      <p className="text-[9px] text-emerald-600/80 font-medium mt-0.5">{reasons.join(' · ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-50/50 p-3 relative overflow-hidden">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={12} className="text-rose-600" />
                <p className="text-[10px] font-black text-rose-700 uppercase tracking-wider">Top 5 — Bajo rendimiento</p>
              </div>
              <div className="space-y-1.5">
                {ranking.low.length === 0 ? (
                  <p className="text-[10px] text-rose-600/60">Todos con buen rendimiento 🎉</p>
                ) : ranking.low.map(({ t, pct, reasons }, i) => (
                  <div key={t.id} className="flex items-start gap-2 bg-white/60 rounded-xl px-2.5 py-1.5 border border-rose-100">
                    <span className="text-sm mt-0.5 shrink-0">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-rose-900 font-bold truncate">{t.nombre || t.id}</span>
                        <span className="text-[11px] font-black text-rose-700 shrink-0">{pct}%</span>
                      </div>
                      <p className="text-[9px] text-rose-600/80 font-medium mt-0.5">{reasons.join(' · ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Grid — Premium Cards */}
        <div className="hidden md:block">
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <h2 className="text-base font-bold text-slate-900">Nómina de trabajadores</h2>
              <p className="text-xs text-slate-500 mt-0.5">Click en una card para abrir la ficha completa</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 font-bold shadow-sm">
                <Users size={12} /> {trabajadoresOrdenados.length}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-sm">
                <DollarSign size={12} /> {formatSueldo(totalAPagarHoy)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {trabajadoresOrdenados.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <p className="text-sm font-semibold text-slate-700">Sin trabajadores para mostrar.</p>
                <p className="text-xs text-slate-400 mt-1">Prueba limpiar búsqueda o cambiar filtros.</p>
              </div>
            ) : trabajadoresOrdenados.map(({ t: trabajador, a }) => {
              const isM = trabajador.genero === 'HOMBRE'
              const cargoUp = (trabajador.cargo || '').toUpperCase()
              const cargoBg = cargoUp.includes('CAJER') ? 'bg-emerald-500' : cargoUp.includes('ENCARGAD') ? 'bg-amber-500' : cargoUp.includes('VENDEDOR') ? 'bg-blue-500' : cargoUp.includes('BODEGUER') ? 'bg-orange-500' : cargoUp.includes('REPONEDOR') ? 'bg-violet-500' : 'bg-slate-500'
              const cargoEmoji = cargoUp.includes('CAJER') ? '💰' : cargoUp.includes('ENCARGAD') ? '⭐' : cargoUp.includes('VENDEDOR') ? '🛍️' : cargoUp.includes('BODEGUER') ? '📦' : cargoUp.includes('REPONEDOR') ? '📋' : '👷'
              const rendPct = a.rendimiento
              const rendTier = rendPct >= 80 ? 'top' : rendPct >= 60 ? 'mid' : 'low'
              const rendColor = rendTier === 'top' ? { ring: '#10b981', text: 'text-emerald-600', bgSoft: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Excelente' } : rendTier === 'mid' ? { ring: '#f59e0b', text: 'text-amber-600', bgSoft: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', label: 'Regular' } : { ring: '#ef4444', text: 'text-red-600', bgSoft: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', label: 'Bajo' }
              const edad = calcEdad(trabajador.fechaNacimiento)
              const adelantosTotal = (trabajador.adelantos || []).reduce((s: number, ad: any) => s + (Number(ad.monto) || 0), 0)
              const adelantosCount = (trabajador.adelantos || []).length
              const ingresoDays = trabajador.fechaIngreso ? Math.max(0, Math.floor((Date.now() - new Date(trabajador.fechaIngreso).getTime()) / 86400000)) : null
              const tenureLabel = ingresoDays !== null ? (ingresoDays > 365 ? `${Math.floor(ingresoDays / 365)}a ${Math.floor((ingresoDays % 365) / 30)}m` : ingresoDays > 30 ? `${Math.floor(ingresoDays / 30)} meses` : `${ingresoDays}d`) : null
              const genderAccent = isM ? 'from-sky-500 via-blue-500 to-indigo-500' : 'from-pink-500 via-rose-500 to-fuchsia-500'
              const ringCircumference = 2 * Math.PI * 26
              const ringOffset = ringCircumference - (rendPct / 100) * ringCircumference
              const isEditing = editingId === trabajador.id
              return (
                <div
                  key={trabajador.id}
                  className="group relative rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all bg-white border border-slate-200/80 hover:border-indigo-300/50 cursor-pointer"
                  onClick={() => { if (isEditing) return; goDetalle(trabajador.id) }}
                >
                  {/* Accent bar */}
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${genderAccent}`} />
                  {/* Glow en hover */}
                  <div className={`absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${genderAccent} opacity-0 group-hover:opacity-10 blur-2xl transition-opacity pointer-events-none`} />

                  {/* HERO */}
                  <div className="relative p-4 pt-5">
                    <div className="flex items-start gap-3">
                      {/* Foto */}
                      <div className="relative shrink-0">
                        <div className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-br ${genderAccent} opacity-80`} />
                        <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-slate-100 group/avatar">
                          {/* Fondo de respaldo con letra inicial siempre presente */}
                          <div className={`absolute inset-0 bg-gradient-to-br ${genderAccent} flex items-center justify-center text-white text-2xl font-black select-none`}>
                            {(trabajador.nombre || '?')[0]?.toUpperCase()}
                          </div>
                          {/* Foto encima si existe */}
                          {trabajador.fotoUrl ? (
                            <img
                              src={trabajador.fotoUrl}
                              alt={trabajador.nombre || ''}
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          ) : null}
                          {uploadingFotoId === trabajador.id && (
                            <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center text-white z-10">
                              <Loader2 size={20} className="animate-spin text-emerald-400" />
                              <span className="text-[8px] font-bold mt-1">Subiendo...</span>
                            </div>
                          )}
                          {isEditing && uploadingFotoId !== trabajador.id && (
                            <label
                              onClick={(e) => e.stopPropagation()}
                              className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer"
                              title="Cambiar foto"
                            >
                              <Image size={16} />
                              <span className="text-[8px] font-bold mt-0.5">Editar</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  e.stopPropagation()
                                  const f = e.target.files?.[0]
                                  if (f) void handleUploadFoto(trabajador.id, f)
                                  e.currentTarget.value = ''
                                }}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                        {/* Género chip flotante */}
                        <span className={`absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-black text-white shadow-md ${isM ? 'bg-sky-500' : 'bg-pink-500'}`}>
                          {isM ? '♂' : '♀'}
                        </span>
                        {/* Status indicator verde de conectado AFUERA del marco */}
                        <div
                          className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full ring-2 ring-white shadow-sm z-10 ${
                            trabajador.activo !== false ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                          title={trabajador.activo !== false ? 'Conectado / Activo' : 'Inactivo'}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input type="text" value={trabajador.nombre} onChange={(e) => handleSave(trabajador.id, 'nombre', e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full px-2 py-1 rounded-lg text-sm font-bold text-slate-900 border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400" autoFocus />
                        ) : (
                          <h3 className="text-sm font-black text-slate-900 leading-tight truncate">{trabajador.nombre || 'Sin nombre'}</h3>
                        )}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white ${cargoBg} shadow-sm`}>
                            <span>{cargoEmoji}</span> {etiquetaCargos(trabajador)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500 font-medium flex-wrap">
                          <span>{flagByNacionalidad(trabajador.nacionalidad)} {trabajador.nacionalidad}</span>
                          {edad && <><span className="text-slate-300">·</span><span>{edad}a</span></>}
                          {tenureLabel && <><span className="text-slate-300">·</span><span className="inline-flex items-center gap-0.5"><Clock size={9} />{tenureLabel}</span></>}
                        </div>
                      </div>

                      {/* Anillo de rendimiento */}
                      <div className="relative shrink-0 h-14 w-14">
                        <svg viewBox="0 0 64 64" className="h-14 w-14 -rotate-90">
                          <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                          <circle cx="32" cy="32" r="26" fill="none" stroke={rendColor.ring} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} className="transition-all duration-1000 ease-out" style={{ filter: `drop-shadow(0 0 4px ${rendColor.ring}50)` }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-xs font-black leading-none ${rendColor.text}`}>{rendPct}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="px-4 pb-2 flex flex-wrap gap-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${a.faltasHastaHoy === 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : a.faltasHastaHoy <= 2 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {a.faltasHastaHoy === 0 ? <><span>✓</span> Sin faltas</> : <><AlertTriangle size={9} strokeWidth={2.5} /> {a.faltasHastaHoy} falta{a.faltasHastaHoy > 1 ? 's' : ''}</>}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${rendColor.bgSoft} ${rendColor.text} ${rendColor.border}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${rendColor.dot}`} />{rendColor.label}
                    </span>
                    {adelantosCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <DollarSign size={9} strokeWidth={2.5} /> {adelantosCount}
                      </span>
                    )}
                    {a.netoAcumulado < 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                        <TrendingDown size={9} strokeWidth={2.5} /> Negativo
                      </span>
                    )}
                  </div>

                  {/* KPIs */}
                  <div className="px-4 pb-3">
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="relative rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/70 p-2.5">
                        <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 grid place-content-center text-white shadow-sm">
                          <DollarSign size={11} strokeWidth={2.5} />
                        </div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Sueldo</div>
                        <div className="text-[12px] font-black text-slate-800 mt-0.5 leading-tight">{formatSueldo(trabajador.sueldo)}</div>
                        <div className="text-[8px] text-slate-400 font-semibold mt-0.5">{formatSueldo(a.pagoPorDia)}/día</div>
                      </div>
                      <div className={`relative rounded-xl border p-2.5 ${a.netoAcumulado >= 0 ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200/60' : 'bg-gradient-to-br from-red-50 to-white border-red-200/60'}`}>
                        <div className={`absolute top-1.5 right-1.5 h-6 w-6 rounded-lg grid place-content-center text-white shadow-sm ${a.netoAcumulado >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
                          {a.netoAcumulado >= 0 ? <TrendingUp size={11} strokeWidth={2.5} /> : <TrendingDown size={11} strokeWidth={2.5} />}
                        </div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Neto</div>
                        <div className={`text-[12px] font-black mt-0.5 leading-tight ${a.netoAcumulado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatSueldo(a.netoAcumulado)}</div>
                        <div className="text-[8px] text-slate-400 font-semibold mt-0.5">Quincena</div>
                      </div>
                      <div className="relative rounded-xl bg-gradient-to-br from-sky-50 to-white border border-sky-200/60 p-2.5">
                        <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 grid place-content-center text-white shadow-sm">
                          <Calendar size={11} strokeWidth={2.5} />
                        </div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Días</div>
                        <div className="text-[12px] font-black text-slate-800 mt-0.5 leading-tight">{a.diasTrabajadosHastaHoy}<span className="text-slate-400">/{a.diasProgramados}</span></div>
                        <div className="text-[8px] text-slate-400 font-semibold mt-0.5">Trabajados</div>
                      </div>
                    </div>
                    {(adelantosTotal > 0 || a.descuentosExtraMonto > 0) && (
                      <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-50/80 to-orange-50/80 border border-amber-200/60 px-2.5 py-1.5">
                        {adelantosTotal > 0 && (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <div className="h-5 w-5 rounded-md bg-amber-500 grid place-content-center shrink-0"><DollarSign size={10} className="text-white" strokeWidth={2.5} /></div>
                            <div className="min-w-0">
                              <div className="text-[8px] text-amber-600/80 font-bold uppercase leading-none">Adelantos</div>
                              <div className="text-[10px] text-amber-800 font-black leading-tight truncate">{formatSueldo(adelantosTotal)}</div>
                            </div>
                          </div>
                        )}
                        {a.descuentosExtraMonto > 0 && (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <div className="h-5 w-5 rounded-md bg-red-500 grid place-content-center shrink-0"><TrendingDown size={10} className="text-white" strokeWidth={2.5} /></div>
                            <div className="min-w-0">
                              <div className="text-[8px] text-red-600/80 font-bold uppercase leading-none">Descuentos</div>
                              <div className="text-[10px] text-red-800 font-black leading-tight truncate">{formatSueldo(a.descuentosExtraMonto)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Edit panel */}
                  {isEditing && (
                    <div className="px-4 py-3 bg-slate-50/80 border-y border-slate-100" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="col-span-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Sucursal / Sede</label>
                          <select value={trabajador.sede} onChange={(e) => handleSave(trabajador.id, 'sede', e.target.value)} className="w-full mt-1 px-2 py-1.5 border border-indigo-200 rounded-lg text-xs bg-white font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                            {dynamicSedes.filter(s => s.id !== 'todas').map(s => (
                              <option key={s.id} value={s.id}>
                                {s.icon} {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {renderBranchEditor(trabajador)}
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Nacionalidad</label>
                          <select value={trabajador.nacionalidad} onChange={(e) => handleSave(trabajador.id, 'nacionalidad', e.target.value)} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                            <option value="CHILENA">CHILENA</option><option value="CHILENO">CHILENO</option><option value="VENEZOLANA">VENEZOLANA</option><option value="VENEZOLANO">VENEZOLANO</option><option value="COLOMBIANA">COLOMBIANA</option><option value="COLOMBIANO">COLOMBIANO</option><option value="ECUATORIANA">ECUATORIANA</option><option value="ECUATORIANO">ECUATORIANO</option><option value="PERUANA">PERUANA</option><option value="PERUANO">PERUANO</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Género</label>
                          <select value={trabajador.genero} onChange={(e) => handleSave(trabajador.id, 'genero', e.target.value as any)} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                            <option value="HOMBRE">HOMBRE</option><option value="MUJER">MUJER</option>
                          </select>
                        </div>
                        {renderCargoEditor(trabajador)}
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Sueldo</label>
                          <input type="number" value={trabajador.sueldo} onChange={(e) => handleSave(trabajador.id, 'sueldo', Number(e.target.value))} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>
                        <div className="col-span-2">
                          <label onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200 cursor-pointer hover:bg-indigo-100 transition">
                            <Image size={11} /> Cambiar foto
                            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadFoto(trabajador.id, f); e.currentTarget.value = '' }} className="hidden" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action bar */}
                  <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/50 to-white px-2 py-2 flex items-center gap-1">
                    {isEditing ? (
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] font-bold shadow-sm hover:shadow-md active:scale-95 transition-all">
                        <Save size={12} strokeWidth={2.5} /> Guardar cambios
                      </button>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(trabajador.id) }} className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-bold hover:border-slate-300 hover:bg-slate-50 active:scale-95 transition-all">
                          <Edit size={11} /> Editar
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setInformeTrabajador(trabajador) }} className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-bold hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 transition-all">
                          <FileText size={11} /> Informe
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setTransferOpen(trabajador); setTransferTarget('') }} className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white border border-slate-200 text-orange-500 hover:border-orange-300 hover:bg-orange-50 active:scale-95 transition-all" title="Transferir">
                          <ArrowRightLeft size={12} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); void handleDelete(trabajador.id) }} className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white border border-slate-200 text-red-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all" title="Eliminar">
                          <Trash2 size={12} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openWorkerAi(trabajador) }} className="inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white text-[10px] font-bold shadow-sm hover:shadow-md active:scale-95 transition-all">
                          <Brain size={11} strokeWidth={2.5} /> IA
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* tabla oculta legacy */}
        <div className="hidden">
          <div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nacionalidad</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Género</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Faltas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acumulado quincena</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargos y accesos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sueldo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trabajadoresOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-600">Sin trabajadores para mostrar con los filtros actuales.</p>
                      <p className="text-xs text-slate-400 mt-1">Prueba limpiar búsqueda o cambiar filtros de género/nacionalidad.</p>
                    </td>
                  </tr>
                ) : trabajadoresOrdenados.map(({ t: trabajador, a }, idx) => (
                  <tr
                    key={trabajador.id}
                    className={`border-l-4 ${borderClassByGenero(trabajador.genero)} ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-indigo-50/50 transition-colors cursor-pointer`}
                    onClick={() => {
                      if (editingId === trabajador.id) return
                      goDetalle(trabajador.id)
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className={`h-10 w-10 rounded-full border-2 overflow-hidden bg-gray-100 ${borderClassByGenero(trabajador.genero)}`}>
                            {uploadingFotoId === trabajador.id ? (
                              <div className="h-full w-full bg-slate-900/60 flex items-center justify-center text-white">
                                <Loader2 size={16} className="animate-spin text-emerald-400" />
                              </div>
                            ) : trabajador.fotoUrl ? (
                              <img src={trabajador.fotoUrl} alt={trabajador.nombre || 'Trabajador'} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-xs text-gray-500 font-bold">
                                {(trabajador.nombre || '?')[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white shadow-sm z-10 ${
                              trabajador.activo !== false ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                            title={trabajador.activo !== false ? 'Conectado / Activo' : 'Inactivo'}
                          />
                        </div>
                        {editingId === trabajador.id && (
                          <label
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm cursor-pointer"
                          >
                            Subir foto
                            <input
                              id={`foto-input-desktop-${trabajador.id}`}
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                e.stopPropagation()
                                const f = e.target.files?.[0]
                                if (f) void handleUploadFoto(trabajador.id, f)
                                e.currentTarget.value = ''
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === trabajador.id ? (
                        <input
                          type="text"
                          value={trabajador.nombre}
                          onChange={(e) => handleSave(trabajador.id, 'nombre', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                      ) : (
                        <div className="min-w-0">
                          <div className="text-sm text-gray-900 font-semibold truncate">{trabajador.nombre}</div>
                          <div className="mt-1 h-2 w-28 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full ${rendimientoColor(calcRendimiento(trabajador))}`}
                              style={{ width: `${calcRendimiento(trabajador)}%` }}
                            />
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-600">Rendimiento: {calcRendimiento(trabajador)}%</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === trabajador.id ? (
                        <select
                          value={trabajador.nacionalidad}
                          onChange={(e) => handleSave(trabajador.id, 'nacionalidad', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="CHILENA">CHILENA</option>
                          <option value="CHILENO">CHILENO</option>
                          <option value="VENEZOLANA">VENEZOLANA</option>
                          <option value="VENEZOLANO">VENEZOLANO</option>
                          <option value="COLOMBIANA">COLOMBIANA</option>
                          <option value="COLOMBIANO">COLOMBIANO</option>
                          <option value="ECUATORIANA">ECUATORIANA</option>
                          <option value="ECUATORIANO">ECUATORIANO</option>
                          <option value="PERÚ">PERÚ</option>
                          <option value="PERU">PERU</option>
                          <option value="PERUANA">PERUANA</option>
                          <option value="PERUANO">PERUANO</option>
                        </select>
                      ) : (
                        <span className="text-sm text-gray-900">{trabajador.nacionalidad}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === trabajador.id ? (
                        <select
                          value={trabajador.genero}
                          onChange={(e) => handleSave(trabajador.id, 'genero', e.target.value as 'HOMBRE' | 'MUJER')}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="HOMBRE">HOMBRE</option>
                          <option value="MUJER">MUJER</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          trabajador.genero === 'HOMBRE' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-pink-100 text-pink-800'
                        }`}>
                          {trabajador.genero}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${a.faltasHastaHoy > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {a.faltasHastaHoy}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-semibold ${a.netoAcumulado < 0 ? 'text-rose-700' : 'text-gray-900'}`}>{formatSueldo(a.netoAcumulado)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === trabajador.id ? renderCargoEditor(trabajador) : <span className="text-sm text-gray-900">{etiquetaCargos(trabajador)}</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === trabajador.id ? (
                        <input
                          type="number"
                          value={trabajador.sueldo}
                          onChange={(e) => handleSave(trabajador.id, 'sueldo', Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-900">{formatSueldo(trabajador.sueldo)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {editingId === trabajador.id ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                            className="text-green-600 hover:text-green-800 transition-colors"
                            title="Guardar"
                          >
                            <Save size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(trabajador.id) }}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Editar"
                          >
                            <Edit size={18} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleDelete(trabajador.id) }}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); setInformeTrabajador(trabajador) }}
                          className="text-slate-700 hover:text-slate-900 transition-colors"
                          title="Informe"
                        >
                          <FileText size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards View — Premium Sophisticated Redesign */}
        <div className="md:hidden space-y-3">
          {trabajadoresOrdenados.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">No hay trabajadores con los filtros actuales.</p>
              <p className="text-xs text-slate-500 mt-1">Ajusta búsqueda, género o nacionalidad.</p>
            </div>
          ) : trabajadoresOrdenados.map(({ t: trabajador, a }) => {
            const isM = trabajador.genero === 'HOMBRE'
            const cargoUp = (trabajador.cargo || '').toUpperCase()
            const cargoBg = cargoUp.includes('CAJER') ? 'bg-emerald-500' : cargoUp.includes('ENCARGAD') ? 'bg-amber-500' : cargoUp.includes('VENDEDOR') || cargoUp.includes('VENDEDORA') ? 'bg-blue-500' : cargoUp.includes('BODEGUER') ? 'bg-orange-500' : cargoUp.includes('REPONEDOR') || cargoUp.includes('REPONEDORA') ? 'bg-violet-500' : 'bg-slate-500'
            const cargoEmoji = cargoUp.includes('CAJER') ? '💰' : cargoUp.includes('ENCARGAD') ? '⭐' : cargoUp.includes('VENDEDOR') || cargoUp.includes('VENDEDORA') ? '🛍️' : cargoUp.includes('BODEGUER') ? '📦' : cargoUp.includes('REPONEDOR') || cargoUp.includes('REPONEDORA') ? '📋' : '👷'
            const rendPct = a.rendimiento
            const rendTier = rendPct >= 80 ? 'top' : rendPct >= 60 ? 'mid' : 'low'
            const rendColor = rendTier === 'top' ? { ring: isM ? '#6366f1' : '#d946ef', ringBg: isM ? 'from-sky-400 to-indigo-500' : 'from-pink-400 to-fuchsia-500', label: 'Excelente', text: 'text-emerald-600', bgSoft: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' } : rendTier === 'mid' ? { ring: '#f59e0b', ringBg: 'from-amber-400 to-orange-500', label: 'Regular', text: 'text-amber-600', bgSoft: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' } : { ring: '#ef4444', ringBg: 'from-rose-400 to-red-500', label: 'Bajo', text: 'text-red-600', bgSoft: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' }
            const edad = calcEdad(trabajador.fechaNacimiento)
            const adelantosTotal = (trabajador.adelantos || []).reduce((s: number, ad: any) => s + (Number(ad.monto) || 0), 0)
            const adelantosCount = (trabajador.adelantos || []).length
            const ingresoDays = trabajador.fechaIngreso ? Math.max(0, Math.floor((Date.now() - new Date(trabajador.fechaIngreso).getTime()) / 86400000)) : null
            const tenureLabel = ingresoDays !== null ? (ingresoDays > 365 ? `${Math.floor(ingresoDays / 365)}a ${Math.floor((ingresoDays % 365) / 30)}m` : ingresoDays > 30 ? `${Math.floor(ingresoDays / 30)} meses` : `${ingresoDays}d`) : null
            const genderAccent = isM ? 'from-sky-500 via-blue-500 to-indigo-500' : 'from-pink-500 via-rose-500 to-fuchsia-500'
            const ringCircumference = 2 * Math.PI * 26
            const ringOffset = ringCircumference - (rendPct / 100) * ringCircumference
            return (
            <div
              key={trabajador.id}
              className="group relative rounded-3xl overflow-hidden shadow-md hover:shadow-xl transition-all active:scale-[0.99] bg-white border border-slate-200/70"
              role="button"
              tabIndex={0}
              onClick={() => { if (editingId === trabajador.id) return; goDetalle(trabajador.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goDetalle(trabajador.id) }}
            >
              {/* Top accent bar */}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${genderAccent} z-10`} />

              {/* ═══ HERO: layout asimétrico con foto cuadrada + info + anillo ═══ */}
              <div className="relative p-3.5 pt-5">
                <div className="flex items-start gap-3">
                  {/* Foto cuadrada con borde gradient */}
                  <div className="relative shrink-0">
                    <div className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-br ${genderAccent} opacity-80`} />
                    <div className="relative h-20 w-20 rounded-2xl overflow-hidden bg-slate-100 group/avatar">
                      {/* Fondo de respaldo con letra inicial siempre presente */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${genderAccent} flex items-center justify-center text-white text-3xl font-black select-none`}>
                        {(trabajador.nombre || '?')[0]?.toUpperCase()}
                      </div>
                      {/* Foto encima si existe */}
                      {trabajador.fotoUrl ? (
                        <img
                          src={trabajador.fotoUrl}
                          alt={trabajador.nombre || ''}
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                      ) : null}
                      {uploadingFotoId === trabajador.id && (
                        <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center text-white z-10">
                          <Loader2 size={24} className="animate-spin text-emerald-400" />
                          <span className="text-[9px] font-bold mt-1">Subiendo...</span>
                        </div>
                      )}
                      {editingId === trabajador.id && uploadingFotoId !== trabajador.id && (
                        <label
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white cursor-pointer"
                          title="Cambiar foto"
                        >
                          <Image size={20} />
                          <span className="text-[9px] font-bold mt-0.5">Editar</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              e.stopPropagation()
                              const f = e.target.files?.[0]
                              if (f) void handleUploadFoto(trabajador.id, f)
                              e.currentTarget.value = ''
                            }}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                    {/* Género chip flotante */}
                    <span className={`absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-black text-white shadow-md ${isM ? 'bg-sky-500' : 'bg-pink-500'}`}>
                      {isM ? '♂' : '♀'}
                    </span>
                    {/* Status indicator verde de conectado AFUERA del marco */}
                    <div
                      className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white shadow-md z-10 ${
                        trabajador.activo !== false ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                      title={trabajador.activo !== false ? 'Conectado / Activo' : 'Inactivo'}
                    />
                  </div>

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    {editingId === trabajador.id ? (
                      <input type="text" value={trabajador.nombre} onChange={(e) => handleSave(trabajador.id, 'nombre', e.target.value)} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="w-full px-2 py-1 rounded-lg text-base font-bold text-slate-900 border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400" autoFocus />
                    ) : (
                      <h3 className="text-[15px] font-black text-slate-900 leading-tight truncate">{trabajador.nombre || 'Sin nombre'}</h3>
                    )}
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${cargoBg} shadow-sm`}>
                        <span className="text-[10px]">{cargoEmoji}</span> {etiquetaCargos(trabajador)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500 font-medium">
                      <span className="inline-flex items-center gap-0.5">{flagByNacionalidad(trabajador.nacionalidad)} {trabajador.nacionalidad}</span>
                      {edad && <><span className="text-slate-300">·</span><span>{edad} años</span></>}
                      {tenureLabel && <><span className="text-slate-300">·</span><span className="inline-flex items-center gap-0.5"><Clock size={9} />{tenureLabel}</span></>}
                    </div>
                  </div>

                  {/* Anillo SVG de rendimiento */}
                  <div className="relative shrink-0 h-16 w-16">
                    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                      <circle
                        cx="32" cy="32" r="26" fill="none"
                        stroke={rendColor.ring}
                        strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                        className="transition-all duration-1000 ease-out"
                        style={{ filter: `drop-shadow(0 0 4px ${rendColor.ring}50)` }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-sm font-black leading-none ${rendColor.text}`}>{rendPct}%</span>
                      <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Rend</span>
                    </div>
                  </div>
                </div>

                {editingId === trabajador.id && (
                  <label onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200 cursor-pointer hover:bg-indigo-100 transition">
                    <Image size={11} /> Cambiar foto
                    <input id={`foto-input-mobile-${trabajador.id}`} type="file" accept="image/*" onChange={(e) => { e.stopPropagation(); const f = e.target.files?.[0]; if (f) void handleUploadFoto(trabajador.id, f); e.currentTarget.value = '' }} className="hidden" />
                  </label>
                )}
              </div>

              {/* ═══ CHIPS row — estado operativo ═══ */}
              <div className="px-3.5 pb-2 flex flex-wrap gap-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${a.faltasHastaHoy === 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : a.faltasHastaHoy <= 2 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {a.faltasHastaHoy === 0 ? <><span>✓</span> Sin faltas</> : <><AlertTriangle size={9} strokeWidth={2.5} /> {a.faltasHastaHoy} falta{a.faltasHastaHoy > 1 ? 's' : ''}</>}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${rendColor.bgSoft} ${rendColor.text} ${rendColor.border}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${rendColor.dot}`} />{rendColor.label}
                </span>
                {adelantosCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <DollarSign size={9} strokeWidth={2.5} /> {adelantosCount}
                  </span>
                )}
                {a.netoAcumulado < 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                    <TrendingDown size={9} strokeWidth={2.5} /> Negativo
                  </span>
                )}
                {a.feriadosTrabHastaHoy > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                    <Star size={9} strokeWidth={2.5} /> {a.feriadosTrabHastaHoy}
                  </span>
                )}
              </div>

              {/* ═══ KPI Grid — 3 columnas con iconos ═══ */}
              <div className="px-3.5 pb-2.5">
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="relative rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/70 p-2.5 overflow-hidden">
                    <div className="absolute top-1.5 right-1.5 h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 grid place-content-center text-white shadow-sm">
                      <DollarSign size={12} strokeWidth={2.5} />
                    </div>
                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Sueldo</div>
                    <div className="text-[13px] font-black text-slate-800 mt-0.5 leading-tight">{formatSueldo(trabajador.sueldo)}</div>
                    <div className="text-[8px] text-slate-400 font-semibold mt-0.5">{formatSueldo(a.pagoPorDia)}/día</div>
                  </div>
                  <div className={`relative rounded-xl border p-2.5 overflow-hidden ${a.netoAcumulado >= 0 ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200/60' : 'bg-gradient-to-br from-red-50 to-white border-red-200/60'}`}>
                    <div className={`absolute top-1.5 right-1.5 h-7 w-7 rounded-lg grid place-content-center text-white shadow-sm ${a.netoAcumulado >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
                      {a.netoAcumulado >= 0 ? <TrendingUp size={12} strokeWidth={2.5} /> : <TrendingDown size={12} strokeWidth={2.5} />}
                    </div>
                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Neto</div>
                    <div className={`text-[13px] font-black mt-0.5 leading-tight ${a.netoAcumulado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatSueldo(a.netoAcumulado)}</div>
                    <div className="text-[8px] text-slate-400 font-semibold mt-0.5">Quincena</div>
                  </div>
                  <div className="relative rounded-xl bg-gradient-to-br from-sky-50 to-white border border-sky-200/60 p-2.5 overflow-hidden">
                    <div className="absolute top-1.5 right-1.5 h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 grid place-content-center text-white shadow-sm">
                      <Calendar size={12} strokeWidth={2.5} />
                    </div>
                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Días</div>
                    <div className="text-[13px] font-black text-slate-800 mt-0.5 leading-tight">{a.diasTrabajadosHastaHoy}<span className="text-slate-400">/{a.diasProgramados}</span></div>
                    <div className="text-[8px] text-slate-400 font-semibold mt-0.5">Trabajados</div>
                  </div>
                </div>
                {(adelantosTotal > 0 || a.descuentosExtraMonto > 0) && (
                  <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-50/80 to-orange-50/80 border border-amber-200/60 px-2.5 py-1.5">
                    {adelantosTotal > 0 && (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <div className="h-5 w-5 rounded-md bg-amber-500 grid place-content-center shrink-0">
                          <DollarSign size={10} className="text-white" strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[8px] text-amber-600/80 font-bold uppercase leading-none">Adelantos</div>
                          <div className="text-[10px] text-amber-800 font-black leading-tight truncate">{formatSueldo(adelantosTotal)}</div>
                        </div>
                      </div>
                    )}
                    {a.descuentosExtraMonto > 0 && (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <div className="h-5 w-5 rounded-md bg-red-500 grid place-content-center shrink-0">
                          <TrendingDown size={10} className="text-white" strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[8px] text-red-600/80 font-bold uppercase leading-none">Descuentos</div>
                          <div className="text-[10px] text-red-800 font-black leading-tight truncate">{formatSueldo(a.descuentosExtraMonto)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Edit fields when editing */}
              {editingId === trabajador.id && (
                <div className="px-3.5 py-3 bg-slate-50/80 border-y border-slate-100">
                  <div className="grid grid-cols-2 gap-2.5 text-sm">
                    <div className="col-span-2">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Sucursal principal</label>
                      <select value={trabajador.sede} onChange={e => void handleSave(trabajador.id, 'sede', e.target.value)} onClick={e => e.stopPropagation()} className="mt-1 w-full rounded-xl border border-indigo-200 bg-white px-2 py-2 text-xs font-bold text-indigo-900">
                        {dynamicSedes.filter(s => s.id !== 'todas').map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                      </select>
                    </div>
                    {renderBranchEditor(trabajador)}
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Nacionalidad</label>
                      <select value={trabajador.nacionalidad} onChange={(e) => handleSave(trabajador.id, 'nacionalidad', e.target.value)} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                        <option value="CHILENA">CHILENA</option><option value="CHILENO">CHILENO</option><option value="VENEZOLANA">VENEZOLANA</option><option value="VENEZOLANO">VENEZOLANO</option><option value="COLOMBIANA">COLOMBIANA</option><option value="COLOMBIANO">COLOMBIANO</option><option value="ECUATORIANA">ECUATORIANA</option><option value="ECUATORIANO">ECUATORIANO</option><option value="PERÚ">PERÚ</option><option value="PERU">PERU</option><option value="PERUANA">PERUANA</option><option value="PERUANO">PERUANO</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Género</label>
                      <select value={trabajador.genero} onChange={(e) => handleSave(trabajador.id, 'genero', e.target.value as 'HOMBRE' | 'MUJER')} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                        <option value="HOMBRE">HOMBRE</option><option value="MUJER">MUJER</option>
                      </select>
                    </div>
                    {renderCargoEditor(trabajador)}
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Teléfono</label>
                      <input type="tel" value={trabajador.telefono || ''} onChange={(e) => handleSave(trabajador.id, 'telefono', e.target.value)} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} placeholder="+56954592656" className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Sueldo</label>
                      <input type="number" value={trabajador.sueldo} onChange={(e) => handleSave(trabajador.id, 'sueldo', Number(e.target.value))} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ Action Bar — diseño segmentado ═══ */}
              <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/50 to-white px-2 py-2 flex items-center gap-1">
                {editingId === trabajador.id ? (
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] font-bold shadow-sm hover:shadow-md active:scale-95 transition-all">
                    <Save size={12} strokeWidth={2.5} /> Guardar cambios
                  </button>
                ) : (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(trabajador.id) }} className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-bold hover:border-slate-300 hover:bg-slate-50 active:scale-95 transition-all" title="Editar">
                      <Edit size={11} /> Editar
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setInformeTrabajador(trabajador) }} className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-bold hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 transition-all" title="Informe">
                      <FileText size={11} /> Informe
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setTransferOpen(trabajador); setTransferTarget('') }} className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white border border-slate-200 text-orange-500 hover:border-orange-300 hover:bg-orange-50 active:scale-95 transition-all" title="Transferir sucursal">
                      <ArrowRightLeft size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); void handleDelete(trabajador.id) }} className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white border border-slate-200 text-red-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all" title="Eliminar">
                      <Trash2 size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); openWorkerAi(trabajador) }} className="inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white text-[10px] font-bold shadow-sm hover:shadow-md active:scale-95 transition-all" title="Chat IA">
                      <Brain size={11} strokeWidth={2.5} /> IA
                    </button>
                  </>
                )}
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {workerAiOpen && workerAiTrabajador ? (() => {
        const t = workerAiTrabajador
        const isM = t.genero === 'HOMBRE'
        const rendPctAi = calcRendimiento(t)
        const aAi = calcAcumuladoQuincenaHastaHoy(t)
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50" onClick={() => setWorkerAiOpen(false)}>
            <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Premium gradient header */}
              <div className={`relative px-4 pt-4 pb-3 ${isM ? 'bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600' : 'bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-600'}`}>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  {[...Array(5)].map((_, i) => (
                    <div key={`aip_${i}`} className="absolute rounded-full bg-white/10" style={{
                      left: `${8 + i * 20}%`, top: `${15 + (i * 19) % 55}%`,
                      width: `${3 + (i % 2)}px`, height: `${3 + (i % 2)}px`,
                      animation: `td_shimmer ${3 + i * 0.6}s ease-in-out ${i * 0.3}s infinite`,
                    }} />
                  ))}
                </div>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {t.fotoUrl ? (
                      <img src={t.fotoUrl} alt="" className="h-10 w-10 rounded-xl object-cover border-2 border-white/30 shadow-lg shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-lg shrink-0 border border-white/20">
                        {(t.nombre || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Brain size={12} className="text-white/80 shrink-0" />
                        <p className="text-xs font-black text-white uppercase tracking-wider truncate">IA · {t.nombre || t.id}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-white/70 font-medium">{flagByNacionalidad(t.nacionalidad)} {etiquetaCargos(t)}</span>
                        <span className="text-[10px] text-white/50">·</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rendPctAi >= 80 ? 'bg-emerald-400/30 text-emerald-100' : rendPctAi >= 60 ? 'bg-amber-400/30 text-amber-100' : 'bg-red-400/30 text-red-100'}`}>{rendPctAi}%</span>
                      </div>
                    </div>
                  </div>
                  <button className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors" onClick={() => setWorkerAiOpen(false)}>
                    <X size={14} className="text-white" />
                  </button>
                </div>
                {/* Quick stats strip */}
                <div className="relative flex items-center gap-3 mt-2.5 pt-2 border-t border-white/15">
                  <span className="text-[9px] text-white/70 font-semibold">💵 {formatSueldo(t.sueldo)}</span>
                  <span className="text-[9px] text-white/70 font-semibold">📊 {formatSueldo(aAi.netoAcumulado)}</span>
                  <span className="text-[9px] text-white/70 font-semibold">📅 {aAi.diasTrabajadosHastaHoy}/{aAi.diasProgramados}d</span>
                  {aAi.faltasHastaHoy > 0 && <span className="text-[9px] text-red-200 font-bold">⚠️ {aAi.faltasHastaHoy}F</span>}
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-auto p-3.5 space-y-2.5 bg-gradient-to-b from-slate-50 to-white min-h-0">
                {workerAiMessages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12px] font-medium leading-relaxed whitespace-pre-wrap ${m.sender === 'user' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-br-md shadow-sm' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm'}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {workerAiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {workerAiMode === 'menu' && (
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <button className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-white border border-indigo-200 text-left hover:bg-indigo-50 transition-colors active:scale-[0.98]" onClick={startWorkerAiPreguntar}>
                      <div className="p-2 rounded-xl bg-indigo-100 shrink-0"><Search size={14} className="text-indigo-600" /></div>
                      <div><p className="text-sm font-bold text-slate-800">Preguntar</p><p className="text-[10px] text-slate-500">Sueldos, faltas, adelantos, rendimiento...</p></div>
                    </button>
                    <button className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-white border border-violet-200 text-left hover:bg-violet-50 transition-colors active:scale-[0.98]" onClick={startWorkerAiHablar}>
                      <div className="p-2 rounded-xl bg-violet-100 shrink-0"><MessageCircle size={14} className="text-violet-600" /></div>
                      <div><p className="text-sm font-bold text-slate-800">Hablar</p><p className="text-[10px] text-slate-500">Cuéntame algo y lo guardo en memoria</p></div>
                    </button>
                    <button className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-white border border-amber-200 text-left hover:bg-amber-50 transition-colors active:scale-[0.98]" onClick={startWorkerAiMasDatos}>
                      <div className="p-2 rounded-xl bg-amber-100 shrink-0"><Brain size={14} className="text-amber-600" /></div>
                      <div><p className="text-sm font-bold text-slate-800">Dar más datos</p><p className="text-[10px] text-slate-500">Mini-entrevista: yo pregunto, tú respondes</p></div>
                    </button>
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="px-3.5 py-3 border-t border-slate-100 bg-white">
                <div className="flex items-center gap-2">
                  <input
                    value={workerAiInput}
                    onChange={(e) => setWorkerAiInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (workerAiMode === 'mas_datos') void handleWorkerAiMasDatosAnswer(workerAiInput); else if (workerAiMode === 'hablar') void sendWorkerAiMessage(`Recuerda: [TRABAJADOR:${t.id}|${t.nombre || t.id}] ${workerAiInput}`); else void sendWorkerAiMessage(workerAiInput) } }}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[12px] font-medium outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 placeholder:text-slate-400"
                    placeholder={workerAiMode === 'mas_datos' ? 'Responde la pregunta…' : workerAiMode === 'hablar' ? 'Cuéntame…' : 'Escribe tu pregunta…'}
                    disabled={workerAiLoading}
                  />
                  <button
                    className="shrink-0 p-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm hover:shadow-md disabled:opacity-40 transition-all active:scale-95"
                    disabled={workerAiLoading || !workerAiInput.trim()}
                    onClick={() => {
                      if (workerAiMode === 'mas_datos') void handleWorkerAiMasDatosAnswer(workerAiInput)
                      else if (workerAiMode === 'hablar') void sendWorkerAiMessage(`Recuerda: [TRABAJADOR:${t.id}|${t.nombre || t.id}] ${workerAiInput}`)
                      else void sendWorkerAiMessage(workerAiInput)
                    }}
                    title="Enviar"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })() : null}

      {informeTrabajador ? (() => {
        const t = informeTrabajador
        const isM = t.genero === 'HOMBRE'
        const rendInf = calcRendimiento(t)
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={() => setInformeTrabajador(null)}>
            <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Premium header */}
              <div className={`relative px-4 pt-4 pb-3 ${isM ? 'bg-gradient-to-r from-sky-500 to-indigo-600' : 'bg-gradient-to-r from-pink-500 to-fuchsia-600'}`}>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className="text-white/80 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white uppercase tracking-wider truncate">Informe · {t.nombre || t.id}</p>
                      <p className="text-[10px] text-white/70 font-medium mt-0.5">{selectedSede} · Quincena actual</p>
                    </div>
                  </div>
                  <button className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors" onClick={() => setInformeTrabajador(null)}>
                    <X size={14} className="text-white" />
                  </button>
                </div>
              </div>

            {(() => {
              const p = calcPagoQuincena(t)
              const quincenaLabel = `${toYmdLocal(p.qStart)} a ${toYmdLocal(p.qEnd)}`
              const adelantos = (t.adelantos || []).filter((a) => {
                const d = new Date(a.ymd)
                d.setHours(0, 0, 0, 0)
                return d >= p.qStart && d <= p.qEnd
              })
              const descuentos = (t.reportes || []).filter((r) => r.tipo === 'descuento').filter((r) => {
                const d = new Date(r.ymd)
                d.setHours(0, 0, 0, 0)
                return d >= p.qStart && d <= p.qEnd
              })
              const totalDescuentos = p.descuentoFaltas + p.adelantosMonto + p.descuentosExtraMonto
              return (
                <div className="p-4 space-y-3">
                  {/* Neto a pagar — hero card */}
                  <div className={`rounded-2xl p-4 relative overflow-hidden ${p.netoPagar >= 0 ? 'bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200' : 'bg-gradient-to-br from-red-50 to-rose-50 border border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">💰 Neto a Pagar</p>
                        <p className={`text-2xl font-black mt-0.5 ${p.netoPagar >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{clp(p.netoPagar)}</p>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">📅 {quincenaLabel}</p>
                      </div>
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${p.netoPagar >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        <DollarSign size={22} className={p.netoPagar >= 0 ? 'text-emerald-600' : 'text-red-600'} />
                      </div>
                    </div>
                  </div>

                  {/* Breakdown grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Base quincena</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{clp(p.baseQuincena)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">📅 Días</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{p.diasTrabajados}/{p.diasProgramados}</p>
                      <p className="text-[9px] text-slate-400">{clp(p.pagoPorDia)}/día</p>
                    </div>
                  </div>

                  {/* Deductions & bonuses */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Desglose</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {p.faltas > 0 && (
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-[11px] text-slate-700 font-medium">⚠️ Faltas ({p.faltas})</span>
                          <span className="text-[11px] font-bold text-red-600">-{clp(p.descuentoFaltas)}</span>
                        </div>
                      )}
                      {p.adelantosMonto > 0 && (
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-[11px] text-slate-700 font-medium">💰 Adelantos ({adelantos.length})</span>
                          <span className="text-[11px] font-bold text-amber-600">-{clp(p.adelantosMonto)}</span>
                        </div>
                      )}
                      {p.descuentosExtraMonto > 0 && (
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-[11px] text-slate-700 font-medium">🔻 Descuentos extra</span>
                          <span className="text-[11px] font-bold text-red-600">-{clp(p.descuentosExtraMonto)}</span>
                        </div>
                      )}
                      {p.feriadosTrab > 0 && (
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-[11px] text-slate-700 font-medium">🌟 Feriados trabajados ({p.feriadosTrab})</span>
                          <span className="text-[11px] font-bold text-emerald-600">+{clp(p.bonoFeriado)}</span>
                        </div>
                      )}
                      {totalDescuentos === 0 && p.bonoFeriado === 0 && (
                        <div className="px-3 py-2">
                          <span className="text-[11px] text-slate-400">Sin descuentos ni bonos esta quincena</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rendimiento bar */}
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <div className="flex items-center justify-between text-[10px] mb-1.5">
                      <span className="font-bold text-slate-500">📈 Rendimiento mensual</span>
                      <span className={`font-black ${rendInf >= 80 ? 'text-emerald-600' : rendInf >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{rendInf}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className={`h-full rounded-full transition-[width] duration-700 ${rendInf >= 80 ? 'bg-gradient-to-r from-emerald-400 to-green-500' : rendInf >= 60 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`} style={{ width: `${rendInf}%` }} />
                    </div>
                  </div>

                  {/* Detail list of adelantos/descuentos */}
                  {(adelantos.length > 0 || descuentos.length > 0) && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Detalle</p>
                      {adelantos.map((a) => (
                        <div key={a.id} className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-amber-800">💰 Adelanto</p>
                            <p className="text-[10px] text-amber-700 truncate">{a.descripcion || '—'}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-[11px] font-black text-amber-700">{clp(Number(a.monto) || 0)}</p>
                            <p className="text-[9px] text-amber-500">{a.ymd}</p>
                          </div>
                        </div>
                      ))}
                      {descuentos.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/50 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-red-800">🔻 Descuento</p>
                            <p className="text-[10px] text-red-700 truncate">{r.descripcion || '—'}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-[11px] font-black text-red-700">{clp(Number(r.monto) || 0)}</p>
                            <p className="text-[9px] text-red-500">{r.ymd}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => void exportExcelTrabajador(t)} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white text-[12px] font-bold shadow-sm hover:shadow-md transition-all active:scale-95">
                      <Download size={14} /> Descargar Excel
                    </button>
                    <button onClick={() => { openWorkerAi(t); setInformeTrabajador(null) }} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 text-[12px] font-bold border border-indigo-200 hover:from-indigo-100 hover:to-violet-100 transition-all active:scale-95">
                      <Brain size={14} /> IA
                    </button>
                    <button onClick={() => setInformeTrabajador(null)} className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-[12px] font-bold hover:bg-slate-200 transition-all active:scale-95">
                      Cerrar
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )
      })() : null}

      {newWorkerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget && !newWorkerSaving) setNewWorkerOpen(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-worker-title" className="flex max-h-[min(92dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="new-worker-title" className="text-lg font-bold text-slate-900">Nuevo trabajador</h2>
                <p className="mt-1 text-xs text-slate-500">Completa la ficha antes de añadirlo a la planilla.</p>
              </div>
              <button type="button" onClick={() => setNewWorkerOpen(false)} disabled={newWorkerSaving} aria-label="Cerrar formulario" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={18} /></button>
            </div>
            <form id="new-worker-form" onSubmit={handleAdd} className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
              <label className="block text-xs font-bold text-slate-700">Nombre completo *
                <input required autoFocus maxLength={120} value={newWorker.nombre} onChange={e => setNewWorker(prev => ({ ...prev, nombre: e.target.value }))} placeholder="Ej. Fernanda Pérez" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs font-bold text-slate-700">Sucursal *
                  <select required value={newWorker.sede} onChange={e => setNewWorker(prev => ({ ...prev, sede: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500">
                    {dynamicSedes.filter(s => s.id !== 'todas').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700">Cargo principal *
                  <select required value={newWorker.cargo} onChange={e => setNewWorker(prev => ({ ...prev, cargo: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500">
                    {CARGO_OPTIONS.map(cargo => <option key={cargo} value={cargo}>{cargo}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700">Sueldo mensual (CLP) *
                  <input required min="1" step="1" type="number" value={newWorker.sueldo} onChange={e => setNewWorker(prev => ({ ...prev, sueldo: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500" />
                </label>
                <label className="block text-xs font-bold text-slate-700">Fecha de ingreso *
                  <input required type="date" value={newWorker.fechaIngreso} onChange={e => setNewWorker(prev => ({ ...prev, fechaIngreso: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500" />
                </label>
                <label className="block text-xs font-bold text-slate-700">Género
                  <select value={newWorker.genero} onChange={e => setNewWorker(prev => ({ ...prev, genero: e.target.value as 'HOMBRE' | 'MUJER', cargo: ['CAJERO', 'CAJERA'].includes(prev.cargo) ? (e.target.value === 'HOMBRE' ? 'CAJERO' : 'CAJERA') : prev.cargo, nacionalidad: ['CHILENO', 'CHILENA'].includes(prev.nacionalidad) ? (e.target.value === 'HOMBRE' ? 'CHILENO' : 'CHILENA') : prev.nacionalidad }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"><option value="MUJER">Mujer</option><option value="HOMBRE">Hombre</option></select>
                </label>
                <label className="block text-xs font-bold text-slate-700">Nacionalidad
                  <select value={newWorker.nacionalidad} onChange={e => setNewWorker(prev => ({ ...prev, nacionalidad: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500">
                    {['CHILENA', 'CHILENO', 'VENEZOLANA', 'VENEZOLANO', 'COLOMBIANA', 'COLOMBIANO', 'ECUATORIANA', 'ECUATORIANO', 'PERUANA', 'PERUANO'].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              {newWorkerError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{newWorkerError}</p>}
            </form>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setNewWorkerOpen(false)} disabled={newWorkerSaving} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancelar</button>
              <button type="submit" form="new-worker-form" disabled={newWorkerSaving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{newWorkerSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear trabajador</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Transfer Worker Modal ═══════════ */}
      {transferOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 z-50" onClick={() => setTransferOpen(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/15 border border-white/20 grid place-content-center">
                  <ArrowRightLeft size={18} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black truncate">Transferir trabajador</p>
                  <p className="text-[11px] text-white/80 truncate">{transferOpen.nombre || transferOpen.id} · {transferOpen.sede}</p>
                </div>
                <button onClick={() => setTransferOpen(null)} className="h-8 w-8 rounded-xl bg-white/15 grid place-content-center hover:bg-white/25"><X size={16} /></button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-600">Selecciona la sucursal destino:</p>
              <div className="grid grid-cols-2 gap-2">
                {sedes.filter(s => s.id !== transferOpen.sede).map(s => (
                  <button key={s.id} onClick={() => setTransferTarget(s.id)} className={`p-3 rounded-2xl border-2 transition-all text-left ${transferTarget === s.id ? 'border-orange-500 bg-orange-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <span className="text-lg">{s.icon}</span>
                    <p className="text-xs font-bold text-slate-800 mt-1">{s.name}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setTransferOpen(null)} className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition">Cancelar</button>
                <button onClick={() => void doTransfer()} disabled={!transferTarget || transferSaving} className="flex-1 px-3 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold shadow-sm hover:shadow-md transition disabled:opacity-50 active:scale-95">
                  {transferSaving ? 'Transfiriendo…' : 'Transferir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Bulk Field Edit Modal ═══════════ */}
      {bulkEditOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 z-50" onClick={() => setBulkEditOpen(false)}>
          <div className="w-full max-w-lg max-h-[85vh] rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 bg-gradient-to-r from-indigo-500 to-violet-500 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/15 border border-white/20 grid place-content-center">
                  <CheckSquare size={18} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">Edición masiva</p>
                  <p className="text-[11px] text-white/80">Cambia un campo a varios trabajadores a la vez</p>
                </div>
                <button onClick={() => setBulkEditOpen(false)} className="h-8 w-8 rounded-xl bg-white/15 grid place-content-center hover:bg-white/25"><X size={16} /></button>
              </div>
            </div>
            <div className="p-4 space-y-3 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Campo</label>
                  <select value={bulkEditField} onChange={(e) => setBulkEditField(e.target.value as any)} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium">
                    <option value="fechaIngreso">Fecha ingreso</option>
                    <option value="sueldo">Sueldo</option>
                    <option value="cargo">Cargos (reemplazar)</option>
                    <option value="nacionalidad">Nacionalidad</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Nuevo valor</label>
                  {bulkEditField === 'fechaIngreso' ? (
                    <input type="date" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
                  ) : bulkEditField === 'sueldo' ? (
                    <input type="number" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)} placeholder="600000" className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
                  ) : (
                    <input type="text" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)} placeholder={bulkEditField === 'cargo' ? 'CAJERO' : 'CHILENA'} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => { const all = new Set(trabajadoresFiltrados.map(t => t.id)); setBulkEditSelected(bulkEditSelected.size === all.size ? new Set() : all) }} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition">
                  {bulkEditSelected.size === trabajadoresFiltrados.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
                <span className="text-[10px] text-slate-400 font-bold">{bulkEditSelected.size} seleccionados</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-4 pb-2 min-h-0">
              <div className="space-y-1">
                {trabajadoresFiltrados.map(t => {
                  const sel = bulkEditSelected.has(t.id)
                  return (
                    <button key={t.id} onClick={() => { const next = new Set(bulkEditSelected); sel ? next.delete(t.id) : next.add(t.id); setBulkEditSelected(next) }} className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${sel ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className={`h-5 w-5 rounded-md border-2 grid place-content-center transition-all ${sel ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 bg-white'}`}>
                        {sel && <span className="text-white text-[10px]">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{t.nombre || t.id}</p>
                        <p className="text-[9px] text-slate-400">{etiquetaCargos(t)} · {bulkEditField === 'fechaIngreso' ? (t.fechaIngreso || '—') : bulkEditField === 'sueldo' ? formatSueldo(t.sueldo) : bulkEditField === 'cargo' ? etiquetaCargos(t) : t.nacionalidad}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
              <button onClick={() => setBulkEditOpen(false)} className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition">Cancelar</button>
              <button onClick={() => void doBulkFieldEdit()} disabled={bulkEditSelected.size === 0 || !bulkEditValue.trim() || bulkEditSaving} className="flex-1 px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-bold shadow-sm hover:shadow-md transition disabled:opacity-50 active:scale-95">
                {bulkEditSaving ? 'Aplicando…' : `Aplicar a ${bulkEditSelected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-3 z-50" onClick={() => setBulkOpen(false)}>
          <div className="w-full max-w-2xl rounded-3xl bg-white border border-gray-200 shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Marcar asistencia masiva</div>
                <div className="mt-0.5 text-xs text-gray-600">Hoy: {todayInfo.ymd} · Sede: {selectedSede}</div>
              </div>
              <button className="text-slate-600 hover:text-slate-900" onClick={() => setBulkOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              Por defecto se marcará <span className="font-semibold">TRABAJO</span> para todos.
              Si alguien no trabajó o fue justificado, cámbialo abajo.
            </div>

            <div className="mt-3 max-h-[55vh] overflow-auto rounded-2xl border border-gray-200">
              <div className="divide-y divide-gray-200">
                {trabajadoresFiltrados.map((t) => {
                  const v = bulkOverrides[t.id] || 'trabajo'
                  return (
                    <div key={t.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{t.nombre || t.id}</div>
                        <div className="text-xs text-gray-600 truncate">{etiquetaCargos(t)} · {t.nacionalidad}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={v}
                          onChange={(e) => {
                            const next = e.target.value as any
                            setBulkOverrides((prev) => ({ ...prev, [t.id]: next }))
                          }}
                          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm"
                        >
                          <option value="trabajo">Trabajó</option>
                          <option value="falta">Falta</option>
                          <option value="justificado">Justificado</option>
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                onClick={() => setBulkOpen(false)}
                disabled={bulkSaving}
              >
                Cancelar
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                onClick={() => void bulkApply()}
                disabled={bulkSaving}
              >
                {bulkSaving ? 'Aplicando…' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adelantosOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 z-50" onClick={() => setAdelantosOpen(false)}>
          <div className="w-full max-w-4xl max-h-[88vh] rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/15 border border-white/20 grid place-content-center">
                  <DollarSign size={18} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">Adelantos por rango</p>
                  <p className="text-[11px] text-white/80">Sede: {selectedSede} · {adelantosRango.length} adelantos · Total {formatSueldo(totalAdelantosRango)}</p>
                </div>
                <button onClick={() => setAdelantosOpen(false)} className="h-8 w-8 rounded-xl bg-white/15 grid place-content-center hover:bg-white/25"><X size={16} /></button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-600 font-semibold">Rango:</span>
                <input type="date" value={adelantosFrom} onChange={(e) => setAdelantosFrom(e.target.value)} className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white" />
                <span className="text-slate-300 text-xs">→</span>
                <input type="date" value={adelantosTo} onChange={(e) => setAdelantosTo(e.target.value)} className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white" />
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Fecha</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Trabajador</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Descripción</th>
                    <th className="px-3 py-2 text-right text-[11px] font-bold text-slate-500 uppercase">Monto</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-slate-500 uppercase">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {adelantosRango.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">Sin adelantos en el rango seleccionado.</td>
                    </tr>
                  ) : adelantosRango.map((a) => (
                    <tr key={`${a.trabajadorId}_${a.adelantoId}`} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-xs font-mono text-slate-600">{a.ymd}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-slate-800">{a.trabajadorNombre}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{a.descripcion || '—'}</td>
                      <td className="px-3 py-2 text-right text-sm font-black text-slate-800">{formatSueldo(a.monto)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => void eliminarAdelantoRango(a.trabajadorId, a.adelantoId)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 disabled:opacity-60"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
