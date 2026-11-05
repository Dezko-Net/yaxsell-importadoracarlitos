'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { AlertCircle, CheckCircle2, Clock3, LockKeyhole, Loader2, LockOpen, Wallet, CalendarDays, ChevronRight, CircleAlert, Trophy, Send } from 'lucide-react'
import { fetchTrabajadoresERP } from '@/lib/trabajadoresErpService'
import { isSellerCargo } from '@/lib/posSellerRoles'
import { usePosAccessLevel } from '@/hooks/usePosAccessLevel'
import { useLiveDataVisibility } from '@/hooks/useLiveDataVisibility'
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess'
import { getSalePagos, getSaleEfectivoNeto } from '@/lib/posSalePayments'

type CajaStaffProfile = {
  id: string
  nombre: string
  cargo: string
  rolOperativoPos?: string
  puedeGestionarCaja?: boolean
  fotoUrl?: string
}

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))
const dateTime = (value: unknown) => {
  const timestamp = Number(value || 0)
  return timestamp > 0 ? new Date(timestamp).toLocaleString('es-CL') : '—'
}
const normalizeStaffName = (name: string) => String(name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
const dateInChile = (timestamp: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(timestamp))
const sessionBusinessDate = (session: any) => {
  const stored = String(session.fechaStr || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored
  const openedAt = Number(session.aperturaAtTs || 0)
  return openedAt > 0 ? dateInChile(openedAt) : ''
}

function StaffAvatar({ name, photoUrl, className }: { name: string; photoUrl?: string; className: string }) {
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
      <span aria-hidden="true">{String(name || '?').trim().charAt(0).toUpperCase()}</span>
      {photoUrl && <img src={photoUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
    </div>
  )
}

function applyLiveSalesToSessions(currentSessions: any[], salesDocs: any[]) {
  const salesBySession = new Map<string, any[]>()
  for (const s of salesDocs) {
    const sId = String(s.sesionCajaId || '').trim()
    if (!sId) continue
    if (!salesBySession.has(sId)) salesBySession.set(sId, [])
    salesBySession.get(sId)!.push(s)
  }

  return currentSessions.map(session => {
    if (session.estado !== 'abierta') return session
    const sessionSales = salesBySession.get(session.id) || []
    const completed = sessionSales.filter(s => String(s.estado || 'completada') === 'completada')
    
    let totalVentas = 0
    let totalEfectivo = 0
    let totalDebito = 0
    let totalTransferencia = 0
    let totalVueltos = 0
    for (const sale of completed) {
      const tot = Number(sale.total) || 0
      totalVentas += tot
      const pagos = getSalePagos(sale)
      const vuelto = Number(sale.vuelto) || 0
      totalVueltos += vuelto
      totalEfectivo += getSaleEfectivoNeto(sale)
      for (const p of pagos) {
        const metodo = String(p.metodo || 'efectivo').toLowerCase()
        const monto = Number(p.monto) || 0
        if (metodo === 'debito') totalDebito += monto
        else if (metodo === 'transferencia') totalTransferencia += monto
      }
    }

    const apertura = Number(session.montoApertura || 0)
    const gastos = Number(session.resumenActual?.gastos || 0)
    const devolucionesCash = Number(session.devolucionesPosEfectivo || 0)
    const devolucionesTotal = Number(session.resumenActual?.totalDevoluciones || 0)
    const efectivoTeorico = apertura + totalEfectivo - gastos - devolucionesCash

    return {
      ...session,
      resumenActual: {
        ...(session.resumenActual || {}),
        ventasCount: completed.length,
        totalVentas: Math.max(0, totalVentas - devolucionesTotal),
        totalEfectivo,
        totalDebito,
        totalTransferencia,
        totalVueltos,
        efectivoTeorico,
      }
    }
  })
}

export default function GestionCajasPage() {
  const liveDataVisible = useLiveDataVisibility()
  const wasPausedRef = useRef(false)
  const params = useParams<{ sede: string }>()
  const sede = String(params?.sede || 'donbalato-central')
  const [today, setToday] = useState(() => dateInChile(Date.now()))
  useEffect(() => {
    const updateToday = () => setToday(dateInChile(Date.now()))
    const timer = window.setInterval(updateToday, 60_000)
    document.addEventListener('visibilitychange', updateToday)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', updateToday) }
  }, [])
  const [sessions, setSessions] = useState<any[]>([])
  const liveSalesRef = useRef<{ sede: string; sales: any[] } | null>(null)
  const [topVendedores, setTopVendedores] = useState<any[]>([])
  const [staffById, setStaffById] = useState<Record<string, CajaStaffProfile>>({})
  const [staffByName, setStaffByName] = useState<Record<string, CajaStaffProfile>>({})
  const [staffLoading, setStaffLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [isRealtimeActive, setIsRealtimeActive] = useState(false)
  const { level: userAccessLevel, isSupreme } = usePosAccessLevel()
  const canReopen = isSupreme || userAccessLevel === 'alto'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [target, setTarget] = useState<any | null>(null)
  const [action, setAction] = useState<'close' | 'reopen'>('close')
  const [amount, setAmount] = useState('')
  const [observacion, setObservacion] = useState('')
  const [extraExpense, setExtraExpense] = useState('')
  const [extraExpenseDetail, setExtraExpenseDetail] = useState('')

  const loadSessions = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Inicia sesión como administrador para gestionar las cajas.')
      const response = await fetch(`/api/pos/cash-management?sede=${encodeURIComponent(sede)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudieron cargar las cajas.')
      const latestSales = liveSalesRef.current
      setSessions(latestSales?.sede === sede ? applyLiveSalesToSessions(payload.sessions || [], latestSales.sales) : (payload.sessions || []))
      setTopVendedores(payload.topVendedores || [])
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar las cajas.')
    } finally { setLoading(false) }
  }, [sede])

  useEffect(() => { loadSessions() }, [loadSessions])

  // Las ventas actualizan sus totales en el listener de ventas. La lista de
  // sesiones solo necesita recargarse cuando cambia su estructura o gastos.
  useEffect(() => {
    if (!sede || !today) return
    if (!liveDataVisible) {
      wasPausedRef.current = true
      liveSalesRef.current = null
      setIsRealtimeActive(false)
      return
    }
    if (wasPausedRef.current) {
      wasPausedRef.current = false
      void loadSessions()
    }
    let isMounted = true

    // 1. Escuchar ventas de hoy en esta sede para actualizar totales de cajeras en vivo
    const qVentas = query(
      collection(db, 'ventas_pos'),
      where('sede', 'in', branchSlugQueryValues(sede)),
      where('fechaStr', '==', today)
    )

    const unsubVentas = onSnapshot(qVentas, (snapshot) => {
      if (!isMounted) return
      setIsRealtimeActive(true)
      const sales: any[] = []
      snapshot.forEach(docSnap => {
        const data = docSnap.data()
        if (matchBranchSlug(data.sede || 'donbalato-central', sede)) {
          sales.push({ id: docSnap.id, ...data })
        }
      })
      liveSalesRef.current = { sede, sales }

      setSessions(prevSessions => {
        if (!prevSessions || prevSessions.length === 0) return prevSessions
        return applyLiveSalesToSessions(prevSessions, sales)
      })
    }, (err) => {
      console.warn('[caja-cerrar] onSnapshot ventas error:', err)
      setIsRealtimeActive(false)
    })

    // 2. Escuchar cambios de estado en sesiones (aperturas o cierres de caja)
    const qSesiones = query(
      collection(db, 'caja_sesiones'),
      where('sede', '==', sede),
      where('fechaStr', '==', today)
    )

    let isFirstSesionesSnapshot = true
    let reloadTimer: ReturnType<typeof setTimeout> | undefined
    const sessionSignatures = new Map<string, string>()
    const sessionSignature = (data: Record<string, unknown>) => {
      // Estos contadores cambian con cada cobro y ya se actualizan mediante
      // el listener de ventas; no justifican volver a leer todas las cajas.
      const ignored = new Set(['ventasCount', 'totalVentas', 'totalEfectivo', 'totalDebito', 'totalTransferencia', 'updatedAt', 'updatedAtTs'])
      return JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key]) => !ignored.has(key)).sort(([a], [b]) => a.localeCompare(b))))
    }
    const unsubSesiones = onSnapshot(qSesiones, (snapshot) => {
      if (!isMounted) return
      let needsReload = false
      for (const change of snapshot.docChanges()) {
        const id = change.doc.id
        if (change.type === 'removed') {
          sessionSignatures.delete(id)
          needsReload = true
          continue
        }
        const signature = sessionSignature(change.doc.data())
        if (sessionSignatures.get(id) !== signature) needsReload = true
        sessionSignatures.set(id, signature)
      }
      if (isFirstSesionesSnapshot) {
        isFirstSesionesSnapshot = false
        return
      }
      if (needsReload) {
        clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => { if (isMounted) void loadSessions() }, 300)
      }
    }, (err) => {
      console.warn('[caja-cerrar] onSnapshot sesiones error:', err)
    })

    return () => {
      isMounted = false
      clearTimeout(reloadTimer)
      unsubVentas()
      unsubSesiones()
    }
  }, [sede, today, loadSessions, liveDataVisible])

  useEffect(() => {
    let active = true
    setStaffLoading(true)
    void fetchTrabajadoresERP()
      .then(workers => {
        if (!active) return
        const byId: Record<string, CajaStaffProfile> = {}
        const byName: Record<string, CajaStaffProfile> = {}
        workers.filter(worker => String(worker.sede || sede) === sede).forEach(worker => {
          const profile: CajaStaffProfile = {
            id: String(worker.$id || ''),
            nombre: String(worker.nombre || ''),
            cargo: String(worker.cargo || ''),
            rolOperativoPos: worker.rolOperativoPos,
            puedeGestionarCaja: Boolean(worker.puedeGestionarCaja),
            fotoUrl: worker.fotoUrl || '',
          }
          if (profile.id) byId[profile.id] = profile
          const name = normalizeStaffName(profile.nombre)
          if (name) byName[name] = profile
        })
        setStaffById(byId)
        setStaffByName(byName)
      })
      .catch(error => console.warn('No se pudieron cargar los perfiles del equipo:', error))
      .finally(() => { if (active) setStaffLoading(false) })
    return () => { active = false }
  }, [sede])

  const profileForSession = useCallback((session: any): CajaStaffProfile | undefined => {
    const id = String(session.cajeroId || '')
    if (id && staffById[id]) return staffById[id]
    return staffByName[normalizeStaffName(session.cajeroNombre || '')]
  }, [staffById, staffByName])
  const sessionNeedsCashManagement = useCallback((session: any) => {
    const profile = profileForSession(session)
    if (!profile) return false
    const cargo = String(profile.cargo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Las cajas de los vendedores no se abren ni gestionan cierres.
    // Solo cajeros reales o personal expresamente autorizado gestionan caja.
    if (isSellerCargo(profile.cargo)) {
      return profile.rolOperativoPos === 'cajero_express' && Boolean(profile.puedeGestionarCaja)
    }
    return cargo.includes('cajer') || Boolean(profile.puedeGestionarCaja)
  }, [profileForSession])
  const openSessions = useMemo(() => sessions.filter(session => session.estado === 'abierta' && sessionBusinessDate(session) === today && sessionNeedsCashManagement(session)), [sessions, today, sessionNeedsCashManagement])
  const staleOpenSessions = useMemo(() => sessions.filter(session => session.estado === 'abierta' && sessionBusinessDate(session) !== today && sessionNeedsCashManagement(session)).slice(0, 20), [sessions, today, sessionNeedsCashManagement])
  const outOfCashSessions = useMemo(() => sessions.filter(session => session.estado === 'abierta' && !sessionNeedsCashManagement(session)).slice(0, 20), [sessions, sessionNeedsCashManagement])
  const closedSessions = useMemo(() => sessions.filter(session => session.estado !== 'abierta' && sessionNeedsCashManagement(session)).slice(0, 40), [sessions, sessionNeedsCashManagement])

  const beginAction = (session: any, nextAction: 'close' | 'reopen') => {
    setTarget(session); setAction(nextAction); setObservacion('')
    setExtraExpense(''); setExtraExpenseDetail('')
    setAmount(nextAction === 'close' ? '' : String(Math.max(0, Number(session.montoApertura || 0))))
    setError('')
  }

  const submitAction = async () => {
    if (!target || saving) return
    const value = Math.round(Number(amount.replace(/[^0-9]/g, '')) || 0)
    if (action === 'close' && !amount.trim()) return setError('Ingresa el efectivo real que entregó la cajera.')
    if (action === 'reopen' && !canReopen) {
      return setError('No tienes permisos suficientes para reanudar cajas. Se requiere nivel de acceso Alto.')
    }
    setSaving(true); setError('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
      const response = await fetch('/api/pos/cash-management', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store',
        body: JSON.stringify({ action, sede, sessionId: target.id, efectivoReal: value, montoApertura: value, observacion: observacion.trim(), gastoAdicional: Math.round(Number(extraExpense) || 0), detalleGastoAdicional: extraExpenseDetail.trim() }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo guardar el movimiento.')
      setTarget(null)
      setNotice(action === 'close' ? 'Caja cerrada y corte guardado.' : 'Caja reanudada con éxito. Corte anterior anulado y ventas/gastos restaurados intactos.')
      await loadSessions()
      setTimeout(() => setNotice(''), 6000)
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el movimiento.')
    } finally { setSaving(false) }
  }

  const amountInput = <input autoFocus value={amount ? Number(amount.replace(/[^0-9]/g, '')).toLocaleString('es-CL') : ''} onChange={event => setAmount(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="0" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg font-bold outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50" />

  return <div data-pos-page="caja-cerrar" className="w-full min-w-0 space-y-5 px-[3%] pt-5 sm:pt-6 pb-12">
    <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-emerald-600" />
      <div className="flex flex-col gap-4 p-5 pl-6 sm:p-6 sm:pl-7 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Wallet size={16} /></span>
            Administrar cajas <span className="text-slate-300">/</span> {sede.replaceAll('-', ' ')}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Cerrar o reabrir cajas</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Gestiona los turnos, registra cierres informados y reabre una caja cuando sea necesario.</p>
        </div>
        <div className="flex items-center self-start lg:self-center">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>{isRealtimeActive ? 'En vivo' : 'Conectando'}</span>
          </div>
        </div>
      </div>
    </header>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Wallet size={19} /></span>
        <div><p className="text-xs font-bold text-slate-500">Abiertas hoy</p><p className="text-2xl font-black text-slate-950">{openSessions.length}</p></div>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 border-l-4 border-l-amber-500 bg-white p-4 shadow-sm">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><CircleAlert size={19} /></span>
        <div><p className="text-xs font-bold text-slate-500">Sesiones antiguas por revisar</p><p className="text-2xl font-black text-slate-950">{staleOpenSessions.length}</p></div>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 border-l-4 border-l-slate-400 bg-white p-4 shadow-sm">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><CheckCircle2 size={19} /></span>
        <div><p className="text-xs font-bold text-slate-500">Cierres recientes</p><p className="text-2xl font-black text-slate-950">{closedSessions.length}</p></div>
      </div>
    </div>

    {error && !target && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800"><AlertCircle size={17} />{error}</div>}
    {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17} />{notice}</div>}

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"/><h2 className="text-lg font-black text-slate-950">Cajas abiertas hoy</h2><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{openSessions.length}</span></div>
        <span className="text-xs font-medium text-slate-500">Sesiones del {new Date(`${today}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'long' })}</span>
      </div>
      {!staffLoading && openSessions.map(session => <article key={session.id} className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
        <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <StaffAvatar name={session.cajeroNombre || 'Cajera'} photoUrl={profileForSession(session)?.fotoUrl} className="h-12 w-12 rounded-2xl bg-emerald-100 text-lg font-black text-emerald-800" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black text-slate-950">{session.cajeroNombre || 'Cajera'}</h3><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">Abierta</span></div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 size={13}/>{dateTime(session.aperturaAtTs)}</span><span>·</span><span>Apertura {fmtCLP(session.montoApertura)}</span></p>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Ventas</span><strong className="mt-1 block text-sm font-black text-[#405566]">{session.resumenActual?.ventasCount || 0}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Total ventas</span><strong className="mt-1 block text-sm font-black text-[#405566]">{fmtCLP(session.resumenActual?.totalVentas || 0)}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Efectivo sistema</span><strong className="mt-1 block text-sm font-black text-[#405566]">{fmtCLP(session.resumenActual?.totalEfectivo || 0)}</strong></div>
                <div className="rounded-xl bg-amber-50 p-3"><span className="block text-[10px] font-bold uppercase tracking-wide text-amber-700">Efectivo teórico</span><strong className="mt-1 block text-sm font-black text-amber-950">{fmtCLP(session.resumenActual?.efectivoTeorico || 0)}</strong></div>
              </div>
              {session.resumenActual?.vendedoresPasaron && session.resumenActual.vendedoresPasaron.length > 0 && (
                <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50/40 p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-teal-900">
                    <Send size={12} className="text-teal-700" />
                    <span>Ventas recibidas de vendedores ({session.resumenActual.vendedoresPasaron.reduce((s: number, v: any) => s + v.count, 0)}):</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {session.resumenActual.vendedoresPasaron.map((v: any) => (
                      <div key={v.nombre} className="inline-flex items-center gap-2 rounded-xl border border-teal-200/80 bg-white px-2.5 py-1.5 text-xs shadow-xs">
                        <StaffAvatar name={v.nombre} photoUrl={v.fotoUrl} className="h-6 w-6 rounded-lg bg-teal-100 text-[10px] font-black text-teal-900" />
                        <span className="font-black text-slate-900">{v.nombre}</span>
                        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-bold text-teal-800">
                          pasó {v.count} {v.count === 1 ? 'venta' : 'ventas'}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          ({fmtCLP(v.total)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
              onClick={() => beginAction(session, 'close')}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 xl:self-center"
            >
              <LockKeyhole size={16} className="text-rose-600" />
              <span>Cerrar caja</span>
              <ChevronRight size={15} className="text-rose-400" />
            </button>
        </div>
      </article>)}
      {(loading || staffLoading) && <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500"><Loader2 size={17} className="animate-spin text-emerald-700"/>Cargando perfiles y cajas…</div>}
      {!loading && !staffLoading && openSessions.length === 0 && <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 size={23}/></span>
        <h3 className="mt-3 font-bold text-[#405566]">No hay cajas abiertas hoy</h3>
        <p className="mt-1 text-sm text-slate-500">Solo aparecen cajeros y vendedores con rol Cajero express, que son quienes manejan efectivo y necesitan cierre.</p>
      </div>}
    </section>

    {/* ── Top vendedores del día (Preventa) ── */}
    <section className="space-y-4 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Trophy size={17} />
          </span>
          <div>
            <h2 className="text-lg font-black text-slate-950">Top vendedores del día (Preventa)</h2>
            <p className="text-xs text-slate-500">Ventas generadas en sala y enviadas a caja para cobro</p>
          </div>
        </div>
        {topVendedores.length > 0 && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {topVendedores.length} {topVendedores.length === 1 ? 'vendedor activo' : 'vendedores activos'} hoy
          </span>
        )}
      </div>

      {!loading && topVendedores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-7 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Send size={18} />
          </div>
          <h3 className="mt-2 text-sm font-bold text-[#405566]">No hay ventas pasadas registradas hoy</h3>
          <p className="mt-1 text-xs text-slate-500">
            Cuando los vendedores pasen carritos a las cajeras en el POS, aquí se mostrará el ranking con sus fotos y estadísticas en tiempo real.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {topVendedores.map((vend, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
            return (
              <article key={vend.nombre} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-teal-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <StaffAvatar name={vend.nombre} photoUrl={vend.fotoUrl} className="h-12 w-12 rounded-2xl bg-teal-50 text-base font-black text-teal-900 border border-teal-100" />
                      <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-black shadow-xs border border-slate-200">
                        {medal}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-950 leading-tight">{vend.nombre}</h3>
                      <span className="mt-0.5 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {vend.cargo || 'Vendedor'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5">
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Ventas pasadas</span>
                    <strong className="text-base font-black text-teal-800">{vend.ventasCount}</strong>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Monto total</span>
                    <strong className="text-sm font-black text-slate-900">{fmtCLP(vend.totalVendido)}</strong>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
                  <span>Ticket prom:</span>
                  <span className="font-bold text-slate-700">{fmtCLP(vend.ticketPromedio)}</span>
                </div>

                {vend.cajerasDesglose?.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Pasó a cajeras:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {vend.cajerasDesglose.map((c: any) => (
                        <span key={c.cajeraNombre} className="inline-flex items-center gap-1 rounded-md bg-teal-50/70 border border-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-900">
                          <span>{c.cajeraNombre}:</span>
                          <strong className="font-bold">{c.count}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>

    {staleOpenSessions.length > 0 && <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><CircleAlert size={19}/></span>
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-slate-950">Sesiones antiguas sin cierre</h2><span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-950">{staleOpenSessions.length} por revisar</span></div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Estos registros todavía dicen “abierta”, pero pertenecen a fechas anteriores. No se cuentan como cajas operativas de hoy y no se modifica su historial automáticamente.</p></div>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {staleOpenSessions.map(session => <article key={session.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-amber-200/80 bg-white p-3">
          <StaffAvatar name={session.cajeroNombre || 'Cajera'} photoUrl={profileForSession(session)?.fotoUrl} className="h-10 w-10 rounded-xl bg-amber-100 text-sm font-black text-amber-900" />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#405566]">{session.cajeroNombre || 'Cajera'}</strong><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Sin cierre</span></div><p className="mt-1 text-xs text-slate-500">Apertura {dateTime(session.aperturaAtTs)} · Sesión {String(session.id).slice(-10)}</p></div>
          <CalendarDays size={17} className="shrink-0 text-amber-700" />
        </article>)}
      </div>
    </section>}

    {!loading && !staffLoading && outOfCashSessions.length > 0 && <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700"><CheckCircle2 size={19}/></span>
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-[#405566]">Registros fuera de la gestión de caja</h2><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">{outOfCashSessions.length}</span></div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Los ayudantes solo envían carritos y no necesitan cerrar. Si falta el perfil, primero hay que vincularlo para confirmar quién puede gestionar esa caja.</p></div>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {outOfCashSessions.map(session => {
          const profile = profileForSession(session)
          const helper = profile && isSellerCargo(profile.cargo) && profile.rolOperativoPos !== 'cajero_express'
          return <article key={session.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <StaffAvatar name={session.cajeroNombre || 'Sin perfil'} photoUrl={profile?.fotoUrl} className="h-10 w-10 rounded-xl bg-slate-100 text-sm font-black text-slate-700" />
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#405566]">{session.cajeroNombre || 'Sin nombre'}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{helper ? 'Ayudante de caja' : profile?.cargo || 'Perfil sin vincular'}</span></div><p className="mt-1 text-xs text-slate-500">Registro abierto {dateTime(session.aperturaAtTs)} · {helper ? 'No requiere cierre' : 'Cierre bloqueado hasta validar el perfil'}</p></div>
          </article>
        })}
      </div>
    </section>}

    <section className="space-y-3 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400"/>
          <h2 className="text-lg font-black text-slate-950">Cajas cerradas recientes</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{closedSessions.length}</span>
        </div>
        <span className="text-xs text-slate-500">
          {canReopen ? 'Tienes permiso de nivel Alto para reanudar cualquier caja.' : 'Se requiere nivel Alto para reanudar cajas cerradas.'}
        </span>
      </div>
      {!staffLoading && closedSessions.map(session => <article key={session.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <StaffAvatar name={session.cajeroNombre || 'Cajera'} photoUrl={profileForSession(session)?.fotoUrl} className="h-11 w-11 rounded-2xl bg-slate-100 text-base font-black text-slate-700" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-slate-950">{session.cajeroNombre || 'Cajera'}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Cerrada</span>
              {session.corteAnteriorAnulado && (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200">Reanudada previamente</span>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Cierre {dateTime(session.cierreAtTs)} <span className="px-1">·</span> Entregó <strong className="text-slate-700">{fmtCLP(session.montoCierre)}</strong>
            </p>
            <p className="text-[11px] text-slate-400">
              Al reanudar, el corte previo queda anulado y se restauran todas las ventas y gastos intactos.
            </p>
          </div>
        </div>
        {canReopen ? (
          <button onClick={() => beginAction(session, 'reopen')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800">
            <LockOpen size={16}/> Reanudar caja <ChevronRight size={15}/>
          </button>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-500" title="Solo usuarias o administradoras con nivel Alto pueden reanudar cajas cerradas.">
            <LockKeyhole size={14} className="text-slate-400" /> Requiere nivel Alto
          </div>
        )}
      </article>)}
      {!loading && !staffLoading && closedSessions.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">Aún no hay cierres de personas con permiso para gestionar caja.</div>}
    </section>

    {target && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onClick={() => !saving && setTarget(null)}><div className="max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6" onClick={event => event.stopPropagation()}>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">{action === 'close' ? 'Cierre administrativo' : 'Reanudación de caja (Nivel Alto)'}</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">{action === 'close' ? `Cerrar caja de ${target.cajeroNombre || 'cajera'}` : `Reanudar caja de ${target.cajeroNombre || 'cajera'}`}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {action === 'close'
            ? 'Registra el monto físico que la cajera informó. El sistema calcula la diferencia contra el efectivo teórico.'
            : 'Se reanudará la sesión de la cajera restaurando todas sus ventas, gastos y apertura como si nunca se hubiera cerrado. El corte anterior quedará anulado.'}
        </p>
      </div>

      {action === 'close' ? (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <div><span className="block text-xs text-slate-500">Efectivo teórico con gasto adicional</span><strong>{fmtCLP((target.resumenActual?.efectivoTeorico || 0) - (Number(extraExpense) || 0))}</strong></div>
            <div><span className="block text-xs text-slate-500">Ventas registradas</span><strong>{fmtCLP(target.resumenActual?.totalVentas || 0)}</strong></div>
          </div>
          <label className="block text-sm font-semibold text-slate-700">Efectivo real entregado{amountInput}</label>
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Gasto no registrado en POS (opcional)<input value={extraExpense ? Number(extraExpense).toLocaleString('es-CL') : ''} onChange={event => setExtraExpense(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600">Detalle del gasto<input value={extraExpenseDetail} onChange={event => setExtraExpenseDetail(event.target.value)} maxLength={120} placeholder="Ej. gasto informado por WhatsApp" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs text-emerald-950 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
            <CheckCircle2 size={18} /> Datos que se restaurarán automáticamente:
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-xl bg-white p-3 shadow-2xs border border-emerald-100/80">
              <span className="block text-slate-500 text-[11px] font-semibold">Apertura inicial</span>
              <strong className="text-slate-900 text-sm font-black">{fmtCLP(target.montoApertura || 0)}</strong>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-2xs border border-emerald-100/80">
              <span className="block text-slate-500 text-[11px] font-semibold">Ventas previas</span>
              <strong className="text-slate-900 text-sm font-black">{target.ventasCount || target.resumenActual?.ventasCount || 0} boletas ({fmtCLP(target.totalVentas || target.resumenActual?.totalVentas || 0)})</strong>
            </div>
          </div>
          <p className="text-[11px] text-emerald-800 leading-relaxed pt-1">
            • El corte anterior de <strong>{fmtCLP(target.montoCierre || 0)}</strong> pasará a estado <strong>ANULADO</strong> en el registro de cortes.
            <br />
            • La cajera podrá seguir operando en su pantalla POS sin perder su apertura ni ventas.
          </p>
        </div>
      )}

      <label className="block text-sm font-semibold text-slate-700">Observación <span className="font-normal text-slate-400">(opcional)</span><textarea value={observacion} onChange={event => setObservacion(event.target.value)} rows={2} maxLength={500} placeholder={action === 'close' ? 'Datos recibidos por WhatsApp, aclaraciones…' : 'Motivo de reanudación…'} className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
      {error && <div role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17} className="shrink-0"/>{error}</div>}
      <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-3 sm:flex-row"><button onClick={() => setTarget(null)} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancelar</button><button onClick={submitAction} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{saving && <Loader2 size={16} className="animate-spin"/>}{saving ? 'Guardando…' : action === 'close' ? 'Guardar cierre' : 'Confirmar reanudación'}</button></div>
    </div></div>}
  </div>
}
