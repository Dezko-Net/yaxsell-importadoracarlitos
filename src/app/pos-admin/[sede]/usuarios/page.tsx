'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { auth, authReady } from '@/lib/firebase'
import { SEDES } from '@/types'
import { Check, CircleAlert, CircleCheck, Loader2, Plus, RefreshCw, Search, Shield, ShieldCheck, UserRound, Users, Wallet, X } from 'lucide-react'
import { normalizePosAccessLevel, type PosAccessLevel } from '@/lib/posAccessLevels'
import { isSellerCargo, normalizePosSellerRole, type PosSellerRole } from '@/lib/posSellerRoles'
import { invalidateTrabajadoresCache } from '@/lib/trabajadoresErpService'

type Worker = {
  id: string
  nombre: string
  cargo: string
  genero?: string
  sede: string
  activo: boolean
  posActivo: boolean
  puedeGestionarCaja: boolean | null
  nivelAccesoPos: PosAccessLevel
  rolOperativoPos?: PosSellerRole
  rolesAdicionales?: Array<'web'>
  telefono?: string
  fotoUrl?: string
  fechaIngreso?: string
  emailCuenta?: string
  rolCuenta?: string
  modulosCuenta?: string[]
}

const ROLE_OPTIONS = [
  { value: 'Cajera', label: 'Cajera' },
  { value: 'Cajero', label: 'Cajero' },
  { value: 'Vendedora', label: 'Vendedora' },
  { value: 'Vendedor', label: 'Vendedor' },
] as const
function genderGroup(value?: string): 'mujer' | 'hombre' | null {
  const normalized = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/^(mujer|femenino|female|f)$/.test(normalized)) return 'mujer'
  if (/^(hombre|masculino|male|m)$/.test(normalized)) return 'hombre'
  return null
}
function roleOptionsFor(genero?: string, currentRole?: string) {
  const gender = genderGroup(genero) || (/^(cajera|vendedora)$/i.test(String(currentRole || '')) ? 'mujer' : /^(cajero|vendedor)$/i.test(String(currentRole || '')) ? 'hombre' : null)
  if (gender === 'mujer') return ROLE_OPTIONS.filter(option => option.value === 'Cajera' || option.value === 'Vendedora')
  if (gender === 'hombre') return ROLE_OPTIONS.filter(option => option.value === 'Cajero' || option.value === 'Vendedor')
  return ROLE_OPTIONS
}
function canonicalRole(cargo: string) {
  const current = String(cargo || '').trim().toLocaleLowerCase('es')
  return ROLE_OPTIONS.find(option => option.value.toLocaleLowerCase('es') === current)?.value || ''
}
function workerIsFemale(worker: Pick<Worker, 'genero' | 'cargo'>) {
  return genderGroup(worker.genero) === 'mujer' || (!genderGroup(worker.genero) && /^(cajera|vendedora)$/i.test(worker.cargo))
}
const POS_ACCESS_OPTIONS: Array<{ value: PosAccessLevel; label: string; description: string }> = [
  { value: 'bajo', label: 'Bajo', description: 'Solo POS: no puede anular, devolver ni editar boletas.' },
  { value: 'medio', label: 'Medio', description: 'POS-Admin, devoluciones, anulaciones y Base de Datos. Sin Administrar ni editar boletas.' },
  { value: 'alto', label: 'Alto', description: 'Todo POS-Admin salvo Configuración general; puede editar boletas indicando motivo y agregar personas.' },
] as const
const SELLER_ROLE_OPTIONS: Array<{ value: PosSellerRole; label: string; description: string }> = [
  { value: 'ayudante_caja', label: 'Ayudante de caja', description: 'Arma y envía carritos a las cajeras.' },
  { value: 'cajero_express', label: 'Cajero express', description: 'Envía carritos y cobra solo con débito o transferencia.' },
]

export default function UsuariosPosAdminPage() {
  const params = useParams<{ sede: string }>()
  const sede = String(params?.sede || 'donbalato-central')
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'todos' | 'activos' | 'inactivos'>('activos')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGender, setNewGender] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newAccessLevel, setNewAccessLevel] = useState<PosAccessLevel>('bajo')
  const [newSellerRole, setNewSellerRole] = useState<PosSellerRole>('ayudante_caja')
  const [newWebRole, setNewWebRole] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // El contexto de la app puede mostrar la sesión desde caché antes de
      // que Firebase restaure auth.currentUser al recargar la página.
      await authReady
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Inicia sesión con una cuenta administradora para gestionar el equipo.')
      const response = await fetch(`/api/pos-admin/users?sede=${encodeURIComponent(sede)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo cargar el equipo.')
      setWorkers(Array.isArray(payload.workers) ? payload.workers : [])
    } catch (e: any) { setError(e?.message || 'No se pudo cargar el equipo.') }
    finally { setLoading(false) }
  }, [sede])

  useEffect(() => { void load() }, [load])

  const saveWorker = async (worker: Worker, changes: Partial<Worker>) => {
    setSavingId(worker.id); setError(''); setNotice('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
      const response = await fetch('/api/pos-admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: worker.id, ...changes }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo guardar el cambio.')
      invalidateTrabajadoresCache()
      setWorkers(current => current.map(item => item.id === worker.id ? { ...item, ...changes } : item))
      setNotice(`Cambios guardados para ${changes.nombre || worker.nombre}.`)
      setTimeout(() => setNotice(''), 3500)
    } catch (e: any) { setError(e?.message || 'No se pudo guardar el cambio.') }
    finally { setSavingId('') }
  }

  const createWorker = async () => {
    const nombre = newName.trim()
    if (!nombre || !newGender || !newRole || creating) return
    setCreating(true); setError('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
      const response = await fetch('/api/pos-admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nombre, cargo: newRole, genero: newGender, nivelAccesoPos: isSellerCargo(newRole) ? 'bajo' : newAccessLevel, rolOperativoPos: newSellerRole, rolesAdicionales: newWebRole && !isSellerCargo(newRole) ? ['web'] : [], sede }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo crear el usuario.')
      invalidateTrabajadoresCache()
      setWorkers(current => [...current, payload.worker].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      setCreateOpen(false); setNewName(''); setNewGender(''); setNewRole(''); setNewAccessLevel('bajo'); setNewSellerRole('ayudante_caja'); setNewWebRole(false)
      setNotice(`${nombre} quedó agregado al equipo y podrá aparecer en el POS.`)
      setTimeout(() => setNotice(''), 4000)
    } catch (e: any) { setError(e?.message || 'No se pudo crear el usuario.') }
    finally { setCreating(false) }
  }

  const filtered = useMemo(() => workers.filter(worker => {
    if (filter === 'activos' && !worker.activo) return false
    if (filter === 'inactivos' && worker.activo) return false
    const needle = query.trim().toLocaleLowerCase('es')
    return !needle || [worker.nombre, worker.cargo, worker.emailCuenta, worker.telefono, worker.rolesAdicionales?.includes('web') ? 'web cajero web' : ''].some(value => String(value || '').toLocaleLowerCase('es').includes(needle))
  }), [workers, filter, query])
  const cashierCount = workers.filter(worker => worker.activo && /cajer/i.test(worker.cargo)).length
  const sellerCount = workers.filter(worker => worker.activo && /vended/i.test(worker.cargo)).length
  const posEnabledCount = workers.filter(worker => worker.activo && worker.posActivo).length
  const activeWorkerCount = workers.filter(worker => worker.activo).length
  const inactiveWorkerCount = workers.length - activeWorkerCount
  const renderAccessControl = (worker: Worker) => {
    if (isSellerCargo(worker.cargo)) {
      const selected = normalizePosSellerRole(worker.rolOperativoPos)
      return <><div className="grid max-w-[340px] grid-cols-2 gap-1 rounded-xl border border-teal-100 bg-teal-50/60 p-1">{SELLER_ROLE_OPTIONS.map(option => <button key={option.value} type="button" disabled={savingId === worker.id} title={option.description} aria-pressed={selected === option.value} onClick={() => selected !== option.value && void saveWorker(worker, { rolOperativoPos: option.value, nivelAccesoPos: 'bajo', puedeGestionarCaja: false })} className={`rounded-lg px-2 py-2 text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50 ${selected === option.value ? option.value === 'cajero_express' ? 'bg-[#087f73] text-white shadow-sm' : 'bg-[#087f73] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800'}`}>{option.label}</button>)}</div><p className="mt-1 max-w-[340px] text-[9px] leading-snug text-slate-500">{SELLER_ROLE_OPTIONS.find(option => option.value === selected)?.description} Sin acceso a POS-admin ni Base de Datos.</p></>
    }
    const selectedPermission = normalizePosAccessLevel(worker.nivelAccesoPos, worker.puedeGestionarCaja)
    return <><fieldset disabled={savingId === worker.id} className="flex max-w-[340px] rounded-xl border border-slate-200 bg-slate-50 p-1"><legend className="sr-only">Nivel de permiso de {worker.nombre}</legend>{POS_ACCESS_OPTIONS.map(option => {const selected = selectedPermission === option.value; const active = option.value === 'bajo' ? 'bg-[#087f73] text-white shadow-sm' : option.value === 'medio' ? 'bg-amber-500 text-white shadow-sm' : 'bg-rose-600 text-white shadow-sm'; return <button key={option.value} type="button" title={`${option.label}: ${option.description}`} aria-label={`${option.label}: ${option.description}`} aria-pressed={selected} onClick={() => !selected && void saveWorker(worker, { nivelAccesoPos: option.value })} className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-all duration-200 hover:-translate-y-px active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 disabled:opacity-60 ${selected ? active : 'text-slate-500 hover:bg-white hover:text-slate-800'}`}><span>{option.label}</span>{selected && <Check size={11} strokeWidth={3}/>}</button>})}</fieldset><p className="mt-1 max-w-[340px] text-[9px] leading-snug text-slate-500">{POS_ACCESS_OPTIONS.find(option => option.value === selectedPermission)?.description}</p></>
  }
  const renderCargoControl = (worker: Worker) => {
    const options = roleOptionsFor(worker.genero, worker.cargo)
    const selectedCargo = canonicalRole(worker.cargo)
    const selectionMatchesSex = options.some(option => option.value === selectedCargo)
    return <div>
      <fieldset disabled={savingId === worker.id} className="flex max-w-[260px] rounded-xl border border-slate-200 bg-slate-50 p-1">
        <legend className="sr-only">Cargo de {worker.nombre}</legend>
        {options.map(option => {
          const selected = selectionMatchesSex && selectedCargo === option.value
          return <button key={option.value} type="button" aria-pressed={selected} onClick={() => !selected && void saveWorker(worker, isSellerCargo(option.value) ? { cargo: option.value, nivelAccesoPos: 'bajo', puedeGestionarCaja: false, rolOperativoPos: worker.rolOperativoPos || 'ayudante_caja', rolesAdicionales: [] } : { cargo: option.value })} className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50 ${selected ? (workerIsFemale(worker) ? 'bg-pink-500 text-white shadow-sm' : 'bg-[#087f73] text-white shadow-sm') : 'text-slate-500 hover:bg-white hover:text-slate-800'}`}>{option.label}</button>
        })}
      </fieldset>
      {!selectionMatchesSex && <p className="mt-1 text-[9px] leading-snug text-amber-700" title={`Cargo guardado: ${worker.cargo}`}>Cargo guardado: {worker.cargo}. Elige el correcto.</p>}
    </div>
  }

  const renderWebRoleControl = (worker: Worker) => {
    const enabled = !isSellerCargo(worker.cargo) && worker.rolesAdicionales?.includes('web') === true
    if (isSellerCargo(worker.cargo)) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400">Solo cajeros</span>
    return <button
      type="button"
      disabled={savingId === worker.id}
      aria-pressed={enabled}
      aria-label={`${enabled ? 'Quitar' : 'Asignar'} rol ${workerIsFemale(worker) ? 'Cajera' : 'Cajero'} Web a ${worker.nombre}`}
      onClick={() => void saveWorker(worker, { rolesAdicionales: enabled ? [] : ['web'] })}
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50 ${enabled ? 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100' : 'border-slate-200 bg-white text-slate-500 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800'}`}
    >
      <span className={`relative h-4 w-7 rounded-full transition-colors ${enabled ? 'bg-teal-500' : 'bg-slate-300'}`}><span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-3' : ''}`} /></span>
      <span>{enabled ? `${workerIsFemale(worker) ? 'Cajera' : 'Cajero'} Web` : 'Agregar Web'}</span>
    </button>
  }

  return <div data-pos-page="usuarios" className="w-full min-w-0 space-y-5 px-[3%] pt-5 sm:pt-6 pb-12">
    <header className="space-y-4 px-1 pt-1">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-teal-100 bg-white text-[#4a154b] shadow-sm"><Users size={20}/></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-black tracking-tight text-[#405566] sm:text-2xl">Equipo de ventas</h1><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-800">{SEDES[sede] || sede}</span></div><p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Gestiona quién usa el POS y quién puede cerrar o reabrir caja.</p></div>
        </div>
        <div className="flex shrink-0 gap-2 pl-14 sm:pl-0"><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Actualizar</button><button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#d96f57] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#c9624c] hover:shadow-md active:translate-y-0 active:scale-[0.98]"><Plus size={16}/> Agregar persona</button></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2 px-1 text-xs">
        <div className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-teal-500"/><span className="text-slate-500">Cajeros activos</span><strong className="text-base font-black text-[#405566]">{cashierCount}</strong></div>
        <div className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan-500"/><span className="text-slate-500">Vendedores activos</span><strong className="text-base font-black text-[#405566]">{sellerCount}</strong></div>
        <div className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"/><span className="text-slate-500">Habilitados en POS</span><strong className="text-base font-black text-[#405566]">{posEnabledCount}</strong></div>
      </div>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><CircleAlert size={17} className="mt-0.5 shrink-0"/>{error}</div>}
    {notice && <div role="status" className="ml-auto flex w-fit max-w-full items-center gap-2.5 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-[0_6px_18px_rgba(16,185,129,0.12)]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><CircleCheck size={15}/></span><span>{notice}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">Guardado</span></div>}

    <section className="overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-teal-100 bg-gradient-to-r from-[#fcf8ff] via-white to-rose-50/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-500">Equipo · {SEDES[sede] || sede}</div><h2 className="mt-1 text-lg font-black text-[#405566]">Cajeros y vendedores</h2><p className="mt-0.5 text-xs text-slate-500">Cargo, entrada al POS, permisos y estado del perfil.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar persona o correo" className="w-full rounded-xl border border-teal-100 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 sm:w-64"/></label>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">{(['todos', 'activos', 'inactivos'] as const).map(value => {const count = value === 'todos' ? workers.length : value === 'activos' ? activeWorkerCount : inactiveWorkerCount; const active = filter === value; return <button key={value} onClick={() => setFilter(value)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold capitalize transition-all duration-200 active:scale-95 ${active ? 'bg-[#d96f57] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-orange-800'}`}><span>{value}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${active ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>{count}</span></button>})}</div>
          </div>
      </div>

      {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/> Cargando equipo…</div>
      : filtered.length === 0 ? <div className="border-b border-dashed border-teal-100 bg-[#fcfaff] py-14 text-center"><UserRound size={28} className="mx-auto text-teal-300"/><p className="mt-2 text-sm font-bold text-slate-700">No hay cajeros o vendedores para mostrar</p><p className="mt-1 text-xs text-slate-500">Prueba otro filtro o agrega una persona de ventas.</p></div>
      : <>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1120px] table-fixed text-left">
            <colgroup><col className="w-[24%]"/><col className="w-[16%]"/><col className="w-[14%]"/><col className="w-[23%]"/><col className="w-[11%]"/><col className="w-[12%]"/></colgroup>
            <thead className="bg-[#faf8fc] text-[10px] font-black uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Persona</th><th className="px-3 py-3">Cargo</th><th className="px-3 py-3">Puede entrar al POS</th><th className="px-3 py-3">Permiso principal</th><th className="px-3 py-3">Rol adicional</th><th className="px-3 py-3 text-right">Estado del perfil</th></tr></thead>
            <tbody className="divide-y divide-teal-50">{filtered.map(worker => {
              const isFemale = workerIsFemale(worker)
              return <tr key={worker.id} className={`group transition-colors hover:bg-orange-50/40 ${worker.activo ? '' : 'bg-slate-50/70 opacity-75'}`}>
                <td className="px-5 py-3"><div className="flex min-w-0 items-center gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-white ${isFemale ? 'bg-gradient-to-br from-pink-400 to-rose-500' : 'bg-gradient-to-br from-teal-400 to-teal-600'} text-sm font-black text-white shadow-sm`}>{worker.fotoUrl ? <img src={worker.fotoUrl} alt="" className="h-full w-full object-cover"/> : worker.nombre.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-extrabold text-[#405566]">{worker.nombre}</div><div className="mt-0.5 truncate text-[11px] text-slate-500">{worker.emailCuenta || 'Perfil operativo sin cuenta vinculada'}</div></div></div></td>
                <td className="px-3 py-3">{renderCargoControl(worker)}</td>
                <td className="px-3 py-3"><button type="button" disabled={savingId === worker.id} aria-pressed={worker.posActivo} aria-label={`${worker.posActivo ? 'Deshabilitar' : 'Habilitar'} POS para ${worker.nombre}`} onClick={() => void saveWorker(worker, { posActivo: !worker.posActivo })} className="group/toggle inline-flex items-center gap-2 rounded-full px-1.5 py-1 transition-all duration-200 hover:bg-emerald-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"><span className={`relative h-6 w-11 rounded-full transition-all duration-200 ${worker.posActivo ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.13)] group-hover/toggle:bg-emerald-600' : 'bg-slate-300 group-hover/toggle:bg-slate-400'}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_4px_rgba(15,23,42,0.25)] transition-transform duration-200 ${worker.posActivo ? 'translate-x-5' : 'translate-x-0'}`}/></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold transition-colors ${worker.posActivo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{worker.posActivo ? 'Habilitado' : 'Deshabilitado'}</span></button></td>
                <td className="px-3 py-3">{renderAccessControl(worker)}</td>
                <td className="px-3 py-3"><div>{renderWebRoleControl(worker)}<p className="mt-1 text-[9px] leading-snug text-slate-400">Habilita Generar cotización en POS.</p></div></td>
                <td className="px-3 py-3 text-right"><div className="inline-flex items-center gap-2">{savingId === worker.id && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600"><Loader2 size={13} className="animate-spin"/> Guardando</span>}<span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${worker.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{worker.activo ? 'ACTIVO' : 'INACTIVO'}</span><button type="button" disabled={savingId === worker.id} onClick={() => void saveWorker(worker, { activo: !worker.activo })} className={`rounded-lg p-2 text-[10px] font-bold transition-all duration-200 hover:-translate-y-px active:scale-95 disabled:opacity-50 ${worker.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`} title={worker.activo ? 'Desactivar perfil de trabajador' : 'Reactivar perfil de trabajador'}>{worker.activo ? 'Desactivar perfil' : 'Reactivar'}</button></div></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <div className="divide-y divide-teal-100 lg:hidden">{filtered.map(worker => {
          const isFemale = workerIsFemale(worker)
          return <article key={worker.id} className={`px-4 py-4 transition-colors hover:bg-orange-50/40 ${worker.activo ? 'bg-white' : 'bg-slate-50 opacity-75'}`}>
            <div className="flex items-center gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full ${isFemale ? 'bg-gradient-to-br from-pink-400 to-rose-500' : 'bg-gradient-to-br from-teal-400 to-teal-600'} text-sm font-black text-white`}>{worker.fotoUrl ? <img src={worker.fotoUrl} alt="" className="h-full w-full object-cover"/> : worker.nombre.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold text-[#405566]">{worker.nombre}</div><div className="truncate text-[11px] text-slate-500">{worker.emailCuenta || 'Perfil operativo sin cuenta vinculada'}</div></div>{savingId === worker.id && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600"><Loader2 size={13} className="animate-spin"/> Guardando</span>}</div>
            <div className="mt-3 grid grid-cols-2 gap-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cargo<div className="mt-1">{renderCargoControl(worker)}</div></div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Puede entrar al POS<button type="button" disabled={savingId === worker.id} aria-pressed={worker.posActivo} aria-label={`${worker.posActivo ? 'Deshabilitar' : 'Habilitar'} POS para ${worker.nombre}`} onClick={() => void saveWorker(worker, { posActivo: !worker.posActivo })} className={`mt-1 flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${worker.posActivo ? 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-[0_0_0_2px_rgba(16,185,129,0.08)]' : 'border-slate-200 bg-slate-100 text-slate-600'}`}><span className="flex items-center gap-2"><span className={`relative h-5 w-9 rounded-full transition-all duration-200 ${worker.posActivo ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]' : 'bg-slate-300'}`}><span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${worker.posActivo ? 'translate-x-4' : ''}`}/></span><span>{worker.posActivo ? 'Habilitado' : 'Deshabilitado'}</span></span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${worker.posActivo ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{worker.posActivo ? 'ON' : 'OFF'}</span></button></div></div>
            <div className="mt-3"><div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{isSellerCargo(worker.cargo) ? 'Modalidad de vendedor' : 'Nivel de permiso'}</div>{renderAccessControl(worker)}</div>
            <div className="mt-3"><div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Rol adicional</div><div className="flex items-center justify-between gap-2">{renderWebRoleControl(worker)}<span className="text-right text-[10px] leading-snug text-slate-400">Generar cotización en POS</span></div></div>
            <div className="mt-3 flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${worker.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>Perfil {worker.activo ? 'activo' : 'inactivo'}</span><button type="button" disabled={savingId === worker.id} onClick={() => void saveWorker(worker, { activo: !worker.activo })} className={`rounded-lg px-3 py-2 text-xs font-bold ${worker.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>{worker.activo ? 'Desactivar perfil' : 'Reactivar perfil'}</button></div>
          </article>
        })}</div>
      </>}
      <div className="flex items-center justify-between border-t border-teal-100 bg-[#fcfaff] px-4 py-3 text-[11px] text-slate-500 sm:px-5"><span>Mostrando <strong className="text-slate-700">{filtered.length}</strong> de <strong className="text-slate-700">{workers.length}</strong> personas</span><span className="hidden items-center gap-1.5 font-medium sm:inline-flex"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Cambios guardados al instante</span></div>
    </section>

    <aside className="flex gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-teal-700"/><div><strong>Estado y permisos</strong><p className="mt-1 text-xs leading-relaxed text-teal-800">“Puede entrar al POS” habilita o bloquea el acceso al punto de venta. “Estado del perfil” indica si la persona sigue activa en el equipo y en los registros laborales. Son controles distintos. Cajeros: Bajo solo POS; Medio agrega POS-admin operativo y Base de Datos; Alto permite administrar el equipo y editar boletas con motivo. El rol adicional Cajero Web conserva el cargo de caja y solo habilita Generar cotización. Vendedores: Ayudante de caja solo envía carritos; Cajero Express también cobra, únicamente con débito o transferencia. Los vendedores no reciben acceso a POS-admin ni Base de Datos. Configuración general y ERP quedan fuera de estos accesos.</p></div></aside>

    {createOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3" onClick={() => !creating && setCreateOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="new-worker-title" className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between"><div><div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-600"><Shield size={14}/> Nuevo perfil de ventas</div><h2 id="new-worker-title" className="mt-1 text-xl font-black text-[#405566]">Agregar cajero o vendedor</h2><p className="mt-1 text-sm text-slate-500">Se guardará en el equipo de ventas de esta sucursal.</p></div><button onClick={() => setCreateOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={19}/></button></div>
      <label className="block text-sm font-semibold text-slate-700">Nombre<input autoFocus value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} placeholder="Ej. Adriano" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-teal-500"/></label>
      <label className="block text-sm font-semibold text-slate-700">Sexo<select required value={newGender} onChange={e => { const value = e.target.value; setNewGender(value); setNewRole(value === 'Hombre' ? 'Cajero' : value === 'Mujer' ? 'Cajera' : '') }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-teal-500"><option value="">Selecciona el sexo</option><option value="Hombre">Hombre</option><option value="Mujer">Mujer</option></select></label>
      <label className="block text-sm font-semibold text-slate-700">Rol<select required value={newRole} onChange={e => { const role = e.target.value; setNewRole(role); if (isSellerCargo(role)) { setNewAccessLevel('bajo'); setNewSellerRole('ayudante_caja'); setNewWebRole(false) } }} disabled={!newGender} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-teal-500 disabled:bg-slate-100">{!newGender && <option value="">Selecciona primero el sexo</option>}{roleOptionsFor(newGender).map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
      {isSellerCargo(newRole) ? <fieldset className="space-y-2"><legend className="text-sm font-semibold text-slate-700">Modalidad de vendedor</legend>{SELLER_ROLE_OPTIONS.map(option => <button key={option.value} type="button" onClick={() => setNewSellerRole(option.value)} aria-pressed={newSellerRole === option.value} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${newSellerRole === option.value ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-300'}`}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${newSellerRole === option.value ? 'border-teal-600 bg-[#087f73] text-white' : 'border-slate-300'}`}>{newSellerRole === option.value && <Check size={12}/>}</span><span><strong className="block text-sm text-slate-800">{option.label}</strong><small className="text-xs text-slate-500">{option.description}</small></span></button>)}</fieldset> : <><label className="block text-sm font-semibold text-slate-700">Nivel de permiso<select value={newAccessLevel} onChange={e => setNewAccessLevel(e.target.value as PosAccessLevel)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-teal-500">{POS_ACCESS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label} · {option.description}</option>)}</select></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-left"><input type="checkbox" checked={newWebRole} onChange={e => setNewWebRole(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal-600"/><span><strong className="block text-sm text-slate-800">Rol adicional: {newGender === 'Mujer' ? 'Cajera' : 'Cajero'} Web</strong><small className="text-xs leading-relaxed text-slate-500">Conserva su cargo de caja y habilita Generar cotización en el POS.</small></span></label></>}
      <div className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">Este perfil aparecerá en el selector del POS, pero no crea una cuenta de correo ni contraseña. El nivel Medio y Alto también habilita Base de Datos; el nivel Alto permite gestionar el equipo. Ninguno agrega permisos de ERP.</div>
      {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button onClick={() => setCreateOpen(false)} disabled={creating} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button onClick={() => void createWorker()} disabled={creating || !newName.trim() || !newGender || !newRole} className="inline-flex items-center gap-2 rounded-xl bg-[#087f73] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{creating && <Loader2 size={16} className="animate-spin"/>}{creating ? 'Guardando…' : 'Agregar al equipo'}</button></div>
    </section></div>}
  </div>
}
