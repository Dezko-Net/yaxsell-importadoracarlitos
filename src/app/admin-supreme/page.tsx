'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BarChart2, Bell, CheckCircle2, ClipboardList, ChevronDown, Crown, Database,
  MapPin, Menu, Palette, RefreshCw, Save, Server, ShoppingCart, Store, Trash2,
  TrendingUp, UserPlus, Users, Wallet, Waypoints, Loader2,
  Check, Shield, ShieldCheck, Briefcase, Mail, User, Lock, Layers,
} from 'lucide-react'
import {
  ADMIN_SUPREME_ALLOWED_EMAIL, APP_ROLES, APP_MODULES, MODULE_LABELS, MODULE_TREE, ROLE_COLORS, ROLE_LABELS, SECTION_STYLES,
  type AppRole, type AppModule, type AppUserRecord, type BranchConfig, type RuntimeAppConfig, type SectionTone,
  createEmptyBranch, getDefaultRuntimeConfig, loadConfig, loadUsers, mergeRuntimeConfig,
  saveConfig, saveUserToAppwrite, deleteUserFromAppwrite, deleteConfig, sanitize,
} from './helpers'
import { fetchTrabajadoresERP } from '@/lib/trabajadoresErpService'
import { getAuth } from 'firebase/auth'
import { ImageUploader, Img, Section, Stat } from './ui'
import { AdminOnboarding } from './onboarding'

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-1 focus:ring-sky-100'
const btnPrimary = 'inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-[12px] font-semibold text-white shadow-xs transition hover:bg-slate-900 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none'
const btnSecondary = 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none'
const labelCls = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wider'
const pill = (active: boolean) => active
  ? 'border-slate-300 bg-slate-100 text-slate-700 shadow-xs'
  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'

export default function AdminSupremePage() {
  const init = useMemo(() => getDefaultRuntimeConfig(), [])
  const baseConfig = useMemo(() => mergeRuntimeConfig(getDefaultRuntimeConfig(), init), [init])
  const [form, setForm] = useState<RuntimeAppConfig>(init)
  const [status, setStatus] = useState<string | null>(null)
  const [users, setUsers] = useState<AppUserRecord[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingUser, setSavingUser] = useState<string | null>(null)
  const [showNewUser, setShowNewUser] = useState(false)
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [newUser, setNewUser] = useState<AppUserRecord>({ email: '', displayName: '', photoURL: init.branding.defaultUserAvatarUrl, role: 'trabajador', modules: ['erp'], branchSlugs: [] })
  const [newBranch, setNewBranch] = useState<BranchConfig>(createEmptyBranch())
  const [trabajadores, setTrabajadores] = useState<Array<{ id: string; nombre: string; cargo: string; sede: string; fotoUrl?: string; activo: boolean }>>([])
  const [loadingTrabajadores, setLoadingTrabajadores] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState<string | null>(null)
  const [newAccount, setNewAccount] = useState<{ trabajadorId: string; email: string; password: string; displayName: string; photoURL: string; modules: AppModule[]; branchSlugs: string[]; defaultModule: AppModule | '' }>({ trabajadorId: '', email: '', password: '', displayName: '', photoURL: '', modules: ['erp'], branchSlugs: [], defaultModule: '' })
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [obCompanyName, setObCompanyName] = useState('')
  const [obOwnerName, setObOwnerName] = useState('')
  const [obBranchName, setObBranchName] = useState('')
  const [obBranchSlug, setObBranchSlug] = useState('')
  const [obBranchImage, setObBranchImage] = useState('')
  const [obSparkMode, setObSparkMode] = useState(true)
  const [obLogoUrl, setObLogoUrl] = useState('https://img.freepik.com/vector-premium/vector-diseno-logotipo-minimalista-abstracto-creativo-elegante-cualquier-empresa-marca_1253202-135975.jpg?semt=ais_rp_progressive&w=740&q=80')
  const [obAvatarUrl, setObAvatarUrl] = useState('https://www.shutterstock.com/image-photo/confident-middle-aged-business-man-600nw-2516789501.jpg')
  const [obGradient, setObGradient] = useState('from-sky-500 via-cyan-500 to-blue-600')
  const [obWorkerName, setObWorkerName] = useState('')
  const [obWorkerNac, setObWorkerNac] = useState('CHILENA')
  const [obWorkerGenero, setObWorkerGenero] = useState<'HOMBRE' | 'MUJER'>('MUJER')

  const supremeEmail = (form.supremeAdminEmail || '').trim().toLowerCase()
  const savedSupremeEmail = (init.supremeAdminEmail || '').trim().toLowerCase()
  const myEmail = ADMIN_SUPREME_ALLOWED_EMAIL
  const myRole: AppRole = 'admin_supremo'
  const canEdit = true



  useEffect(() => {
    if (!onboardingOpen) return
    document.body.classList.add('overflow-hidden')
    return () => document.body.classList.remove('overflow-hidden')
  }, [onboardingOpen])

  const submitOnboarding = async () => {
    const company = obCompanyName.trim()
    const owner = obOwnerName.trim()
    const bName = obBranchName.trim()
    const bSlug = obBranchSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (!company || !owner || !bName || !bSlug) { setStatus('Faltan datos: completa todos los campos.'); return }
    const newConfig: RuntimeAppConfig = {
      ...getDefaultRuntimeConfig(),
      companyName: company, legalName: company,
      companyDescription: `Panel maestro para ${company}`,
      sparkMode: obSparkMode,
      ownerProfile: { ...getDefaultRuntimeConfig().ownerProfile, displayName: owner },
      branding: { ...getDefaultRuntimeConfig().branding, companyLogoUrl: obLogoUrl, defaultUserAvatarUrl: obAvatarUrl },
      branches: [{ slug: bSlug, name: bName, region: '', icon: '🏪', color: 'blue', active: true, imageUrl: obBranchImage, managerEmail: '' }],
    }
    setForm(newConfig)
    setStatus('Guardando configuración…')
    const ok = await saveConfig(newConfig)
    if (!ok) { setStatus('Error al guardar la configuración. Revisa la consola para más detalles.'); return }

    if (obWorkerName.trim()) {
      try {
        await fetch('/api/admin-supreme/save-trabajador', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: obWorkerName.trim(),
            cargo: 'Cajera',
            sede: bSlug,
            nacionalidad: obWorkerNac,
            genero: obWorkerGenero,
            activo: true,
          }),
        })
      } catch (e) { console.error('[onboarding] save-trabajador error:', e) }
    }

    setStatus(null)
    setOnboardingOpen(false)
  }

  const activeCount = useMemo(() => form.branches.filter((b) => b.active).length, [form.branches])
  const [activeSection, setActiveSection] = useState<SectionTone>('brand')
  const sectionItems = [
    { key: 'brand' as SectionTone, label: 'Mi Empresa', detail: 'Logo, nombre y color', icon: <Palette size={17} />, badge: `${form.branding.companyLogoUrl ? '1' : '0'} logo` },
    { key: 'owner' as SectionTone, label: 'Operador', detail: 'Dueño y correo supremo', icon: <Crown size={17} />, badge: form.ownerProfile.displayName || 'Sin nombre' },
    { key: 'branches' as SectionTone, label: 'Sucursales', detail: 'Sedes y managers', icon: <Store size={17} />, badge: `${activeCount}/${form.branches.length} activas` },
    { key: 'users' as SectionTone, label: 'Usuarios', detail: 'Roles y accesos', icon: <Users size={17} />, badge: `${users.length} usuarios` },
  ]
  const activeSectionMeta = sectionItems.find((item) => item.key === activeSection) || sectionItems[0]

  /* form updaters */
  function set<K extends keyof RuntimeAppConfig>(k: K, v: RuntimeAppConfig[K]) { setForm((p) => ({ ...p, [k]: v })) }
  function setBrand(k: keyof RuntimeAppConfig['branding'], v: string) { setForm((p) => ({ ...p, branding: { ...p.branding, [k]: v } })) }
  function setOwner(k: keyof RuntimeAppConfig['ownerProfile'], v: string) { setForm((p) => ({ ...p, ownerProfile: { ...p.ownerProfile, [k]: v } })) }
  function setBranch(slug: string, k: string, v: string | boolean) { setForm((p) => ({ ...p, branches: p.branches.map((b) => b.slug === slug ? { ...b, [k]: v } : b) })) }

  function addBranch() {
    if (!canEdit) return
    const slug = sanitize(newBranch.slug || newBranch.name).replace(/^-+|-+$/g, '')
    const name = newBranch.name.trim()
    if (!slug || !name) { setStatus('La nueva sucursal necesita nombre y slug válidos.'); return }
    if (form.branches.some((b) => b.slug === slug)) { setStatus(`Ya existe una sucursal con el slug ${slug}.`); return }
    setForm((p) => ({ ...p, branches: [...p.branches, { ...newBranch, slug, name, region: newBranch.region.trim(), icon: newBranch.icon.trim() || '🏬', color: newBranch.color.trim() || 'slate', imageUrl: newBranch.imageUrl.trim(), managerEmail: newBranch.managerEmail.trim().toLowerCase() }] }))
    setStatus(`Sucursal ${name} creada.`)
    setShowNewBranch(false)
    setNewBranch(createEmptyBranch())
  }

  function removeBranch(slug: string) {
    if (!canEdit) return
    const branch = form.branches.find((b) => b.slug === slug)
    if (!branch) return
    if (!confirm(`¿Eliminar la sucursal ${branch.name}?`)) return
    setForm((p) => ({ ...p, branches: p.branches.filter((b) => b.slug !== slug) }))
    setUsers((p) => p.map((u) => ({ ...u, branchSlugs: (u.branchSlugs || []).filter((s) => s !== slug) })))
    setStatus(`Sucursal ${branch.name} eliminada.`)
  }

  /* load remote config */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingConfig(true)
      try {
        const remote = await loadConfig()
        if (cancelled) return
        if (remote) {
          setForm(remote)
          const hasCompany = Boolean(remote.companyName && remote.companyName.trim().length > 0 && !remote.companyName.toLowerCase().includes('yaxsel'))
          if (!hasCompany) {
            setOnboardingOpen(true)
          } else {
            setOnboardingOpen(false)
          }
        } else {
          setForm(baseConfig)
        }
      } catch (e) {
        console.error(e)
        setStatus('No se pudo cargar la configuración.')
      } finally {
        if (!cancelled) setLoadingConfig(false)
      }
    })()
    return () => { cancelled = true }
  }, [baseConfig])

  /* load users */
  useEffect(() => {
    (async () => {
      setLoadingUsers(true)
      try {
        const [list, trabs] = await Promise.all([loadUsers(), fetchTrabajadoresERP()])
        const trabsMap = new Map(trabs.map((t: any) => [t.$id, t.fotoUrl]))
        // Sincronizar foto desde el trabajador si el usuario no tiene photoURL
        list.forEach(u => {
          if ((!u.photoURL || u.photoURL === '') && u.trabajadorId && trabsMap.has(u.trabajadorId)) {
            u.photoURL = trabsMap.get(u.trabajadorId) || ''
          }
        })
        list.sort((a, b) => APP_ROLES.indexOf(b.role) - APP_ROLES.indexOf(a.role))
        setUsers(list)
      } catch (e) { console.error(e) } finally { setLoadingUsers(false) }
    })()
  }, [])

  /* load trabajadores */
  useEffect(() => {
    (async () => {
      setLoadingTrabajadores(true)
      try {
        const list = await fetchTrabajadoresERP()
        setTrabajadores(list.filter((t: any) => t.activo).map((t: any) => ({ id: t.$id, nombre: t.nombre, cargo: t.cargo, sede: t.sede, fotoUrl: t.fotoUrl, activo: t.activo })))
      } catch (e) { console.error(e) } finally { setLoadingTrabajadores(false) }
    })()
  }, [])

  const createAccount = async () => {
    if (!newAccount.email || !newAccount.password) { setStatus('Email y contraseña obligatorios.'); return }
    if (newAccount.password.length < 6) { setStatus('Contraseña mínimo 6 caracteres.'); return }
    setCreatingAccount(newAccount.email)
    try {
      const auth = getAuth()
      const token = await (auth.currentUser?.getIdToken?.() || '')
      const res = await fetch('/api/admin-supreme/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          email: newAccount.email,
          password: newAccount.password,
          displayName: newAccount.displayName,
          photoURL: newAccount.photoURL,
          role: 'trabajador',
          modules: newAccount.modules,
          branchSlugs: newAccount.branchSlugs,
          trabajadorId: newAccount.trabajadorId,
          createdBy: myEmail,
          defaultModule: newAccount.defaultModule,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setStatus(`✅ Cuenta creada para ${newAccount.email}`)
        setNewAccount({ trabajadorId: '', email: '', password: '', displayName: '', photoURL: '', modules: ['erp'], branchSlugs: [], defaultModule: '' })
        const list = await loadUsers()
        list.sort((a, b) => APP_ROLES.indexOf(b.role) - APP_ROLES.indexOf(a.role))
        setUsers(list)
      } else {
        setStatus(`❌ ${json.error || 'Error creando cuenta'}`)
      }
    } catch (e: any) { setStatus(`❌ ${e?.message || e}`) } finally { setCreatingAccount(null) }
  }

  const saveUser = async (entry: AppUserRecord) => {
    const email = entry.email.trim().toLowerCase()
    if (!email) { setStatus('Se necesita un email.'); return }
    const norm: AppUserRecord = { ...entry, email, displayName: (entry.displayName || email.split('@')[0]).trim(), photoURL: (entry.photoURL || form.branding.defaultUserAvatarUrl).trim(), role: email === (supremeEmail || savedSupremeEmail) ? 'admin_supremo' : entry.role, modules: entry.modules || ['erp'], branchSlugs: entry.branchSlugs || [], trabajadorId: entry.trabajadorId || '', hasAccount: entry.hasAccount ?? false, createdAt: entry.createdAt || Date.now(), createdBy: entry.createdBy || myEmail, defaultModule: entry.defaultModule || '' }
    setSavingUser(email)
    try {
      await saveUserToAppwrite(norm)
      setUsers((p) => { const exists = p.some((u) => u.email === email); const next = exists ? p.map((u) => u.email === email ? norm : u) : [...p, norm]; return next.sort((a, b) => APP_ROLES.indexOf(b.role) - APP_ROLES.indexOf(a.role)) })
      setStatus(`${email} guardado.`)
    } catch (e) { console.error(e); setStatus(`Error guardando ${email}.`) } finally { setSavingUser(null) }
  }

  const deleteUser = async (email: string) => {
    if (email === (supremeEmail || savedSupremeEmail) || !confirm(`¿Eliminar ${email}?`)) return
    setSavingUser(email)
    try { await deleteUserFromAppwrite(email); setUsers((p) => p.filter((u) => u.email !== email)); setStatus(`${email} eliminado.`) } catch { setStatus(`Error eliminando ${email}.`) } finally { setSavingUser(null) }
  }

  const handleSave = async () => {
    if (!canEdit) return
    try {
      // Sincronizar: el avatar de admin es la foto del operador, y el email supremo es el email del operador
      const syncedForm = {
        ...form,
        ownerProfile: {
          ...form.ownerProfile,
          photoURL: form.branding.defaultUserAvatarUrl,
          email: form.supremeAdminEmail,
        },
      }
      await saveConfig(syncedForm)
      setStatus('Guardado en Firestore. Recargando...')
      setTimeout(() => window.location.reload(), 2000)
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Error desconocido'
      setStatus(`Error al guardar: ${detail}`)
    }
  }

  const handleReset = async () => {
    if (!canEdit) return
    await deleteConfig()
    setStatus('Restaurado. Recargando...')
    setTimeout(() => window.location.reload(), 400)
  }

  if (loadingConfig) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="rounded-xl border border-slate-200 bg-white px-8 py-6 text-center shadow-xs">
          <div className="text-sm font-semibold text-slate-500">Cargando configuración...</div>
        </div>
      </div>
    )
  }

  const activeSectionContent = (() => {
    switch (activeSection) {
      case 'brand':
        return (
          <Section icon={<Palette size={18} />} title="Marca e identidad" subtitle="Cómo se presenta tu empresa." tone="brand">
            {/* Preview de navbar (réplica del ERP dashboard) */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              {/* Navbar principal */}
              <div className="px-4 py-4 bg-white flex items-center justify-between gap-2">
                {/* Izquierda: menu + logo + empresa */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg hover:bg-slate-100 transition flex-shrink-0">
                    <Menu size={22} className="text-slate-600" />
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Logo con anillos */}
                    <div className="relative flex-shrink-0 w-[56px] h-[56px]" style={{
                      '--logo-color': form.branding.titleColor || '#3b82f6',
                    } as React.CSSProperties}>
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 68 68" style={{ animation: 'logo_spin 5s linear infinite' }}>
                        <defs>
                          <linearGradient id="previewLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={form.branding.titleColor || '#3b82f6'} stopOpacity="1" />
                            <stop offset="50%" stopColor={form.branding.titleColor || '#3b82f6'} stopOpacity="0.5" />
                            <stop offset="100%" stopColor={form.branding.titleColor || '#3b82f6'} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <circle cx="34" cy="34" r="32" fill="none" stroke="url(#previewLogoGrad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="80 140" />
                      </svg>
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 68 68" style={{ animation: 'logo_spinRev 8s linear infinite' }}>
                        <circle cx="34" cy="34" r="30" fill="none" stroke={form.branding.titleColor || '#3b82f6'} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 6" />
                      </svg>
                      <div className="absolute inset-1 rounded-full overflow-hidden border-2 border-white/80 shadow-lg bg-white">
                        <Img src={form.branding.companyLogoUrl} alt="" fallback="🏢" className="h-full w-full rounded-full" />
                      </div>
                    </div>
                    {/* Nombre empresa */}
                    <div className="min-w-0">
                      <h1 className="text-base font-black whitespace-nowrap truncate" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '0.02em' }}>
                        <span className="bg-clip-text text-transparent" style={{
                          backgroundImage: `linear-gradient(90deg, ${form.branding.titleColor || '#3b82f6'} 0%, ${form.branding.titleColor ? form.branding.titleColor + 'cc' : '#3b82f6cc'} 50%, ${form.branding.titleColor || '#3b82f6'} 100%)`
                        }}>{form.companyName || 'Sin nombre'}</span>
                      </h1>
                      <p className="text-[10px] text-slate-400 -mt-0.5 truncate">viernes, 11 sept · 05:16 p. m.</p>
                    </div>
                  </div>
                  {/* Selector sede */}
                  <div className="hidden md:block ml-1">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-50 border-slate-200 text-slate-700 text-[11px] font-bold">
                      <MapPin size={12} />
                      <span>Todas las sedes</span>
                      <ChevronDown size={12} />
                    </div>
                  </div>
                </div>
                {/* Derecha: acciones */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Ventas hoy */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                      <Wallet size={10} />
                    </div>
                    <div className="leading-tight">
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600">Ventas hoy</p>
                      <p className="text-[11px] font-black text-emerald-800 tabular-nums">$0</p>
                    </div>
                  </div>
                  {/* Estado en línea */}
                  <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-700">
                    <div className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider">En línea</span>
                  </div>
                  {/* Shortcuts */}
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                    <ClipboardList size={14} /><span>Cuadres</span>
                  </div>
                  <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                    <TrendingUp size={14} /><span>Ganancias</span>
                  </div>
                  <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                    <BarChart2 size={14} /><span>POS</span>
                  </div>
                  <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-semibold">
                    <Database size={14} /><span>BD</span>
                  </div>
                  {/* Notificaciones */}
                  <div className="relative flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 text-slate-600 transition">
                    <Bell size={18} />
                  </div>
                  {/* Avatar admin */}
                  <div className="relative rounded-xl ring-2 ring-white shadow-md h-[54px] w-[54px] shrink-0">
                    <div className="absolute inset-0 rounded-xl overflow-hidden">
                      <Img src={form.branding.defaultUserAvatarUrl} alt="" fallback="👤" className="h-full w-full rounded-xl" />
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white z-10" />
                  </div>
                </div>
              </div>
              {/* Barra inferior con gradiente */}
              <div className="h-1" style={{ background: `linear-gradient(90deg, ${form.branding.titleColor || '#3b82f6'} 0%, ${form.branding.titleColor ? form.branding.titleColor + 'cc' : '#3b82f6cc'} 50%, ${form.branding.titleColor || '#3b82f6'} 100%)` }} />
            </div>

            {/* Datos de empresa */}
            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              <div>
                <label className={labelCls}>Nombre comercial</label>
                <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>Raz&oacute;n social</label>
                <input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} className={inputCls} disabled={!canEdit} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Descripci&oacute;n comercial</label>
                <textarea value={form.companyDescription} onChange={(e) => set('companyDescription', e.target.value)} rows={2} className={`${inputCls} resize-y`} disabled={!canEdit} />
              </div>
            </div>

            {/* Imágenes */}
            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              <div>
                <label className={labelCls}>Logo de la empresa</label>
                <ImageUploader value={form.branding.companyLogoUrl} onChange={(v) => setBrand('companyLogoUrl', v)} fallback="🏢" shape="landscape" disabled={!canEdit} slot="logo" />
              </div>
              <div>
                <label className={labelCls}>Avatar de Admin</label>
                <ImageUploader value={form.branding.defaultUserAvatarUrl} onChange={(v) => setBrand('defaultUserAvatarUrl', v)} fallback="👤" shape="circle" disabled={!canEdit} slot="avatar" />
              </div>
            </div>

            {/* Color */}
            <div>
              <label className={labelCls}>Color del t&iacute;tulo</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#84cc16', '#14b8a6', '#64748b'].map((color) => (
                  <button key={color} onClick={() => setBrand('titleColor', color)} disabled={!canEdit}
                    className={`relative h-8 w-8 rounded-lg border-2 transition-all ${form.branding.titleColor === color ? 'border-slate-900 scale-110' : 'border-slate-200 hover:border-slate-400'} ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    style={{ background: `linear-gradient(135deg, ${color}, ${color}80)` }}>
                    {form.branding.titleColor === color && <div className="absolute inset-0 flex items-center justify-center"><div className="h-1.5 w-1.5 rounded-full bg-white" /></div>}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="relative h-9 w-9 rounded-full border border-slate-300 overflow-hidden shadow-sm cursor-pointer" style={{ background: `linear-gradient(135deg, ${form.branding.titleColor || '#3b82f6'}, ${form.branding.titleColor ? form.branding.titleColor + '80' : '#3b82f680'})` }} title="Click para elegir color">
                  <input type="color" value={form.branding.titleColor || '#3b82f6'} onChange={(e) => setBrand('titleColor', e.target.value)} disabled={!canEdit}
                    className="absolute inset-0 h-[200%] w-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer border-0 p-0 opacity-0 disabled:cursor-not-allowed" style={{ background: 'none' }} />
                </div>
                <input value={form.branding.titleColor} onChange={(e) => setBrand('titleColor', e.target.value)} className={`${inputCls} w-32`} disabled={!canEdit} placeholder="#3b82f6" />
              </div>
            </div>
          </Section>
        )
      case 'owner':
        return (
          <Section icon={<Crown size={18} />} title="Operador principal" subtitle="La persona dueña del sistema y el correo maestro del panel." tone="owner">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Nombre</label><input value={form.ownerProfile.displayName} onChange={(e) => setOwner('displayName', e.target.value)} className={inputCls} disabled={!canEdit} /></div>
              <div><label className={labelCls}>Email admin supremo</label><input value={form.supremeAdminEmail} onChange={(e) => set('supremeAdminEmail', e.target.value)} className={inputCls} placeholder="dueno@empresa.com" disabled={!canEdit} /></div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">La foto se configura en "Marca e identidad" → Avatar de Admin.</p>
          </Section>
        )
      case 'branches':
        return (
          <Section icon={<Store size={18} />} title="Sucursales" subtitle={`Define qué sedes existen, cómo se ven y quién las lidera. ${activeCount} activas.`} tone="branches">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
              <div>
                <div className="text-[13px] font-bold text-slate-900">Gestión de sucursales</div>
                <div className="text-[12px] text-slate-600">Crea nuevas sedes, edita sus datos y elimina las que ya no usarás.</div>
              </div>
              <button onClick={() => setShowNewBranch((p) => !p)} disabled={!canEdit} className={`${btnPrimary} !py-2 !text-[12px]`}><Store size={14} /> Nueva sucursal</button>
            </div>
            {showNewBranch && (
              <div className="mt-4 rounded-3xl bg-white/50 backdrop-blur-xl border border-white/50 shadow-sm p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className={labelCls}>Nombre</label><input value={newBranch.name} onChange={(e) => setNewBranch((p) => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="Nueva sucursal" disabled={!canEdit} /></div>
                  <div><label className={labelCls}>Slug</label><input value={newBranch.slug} onChange={(e) => setNewBranch((p) => ({ ...p, slug: sanitize(e.target.value) }))} className={inputCls} placeholder="nueva-sucursal" disabled={!canEdit} /></div>
                  <div><label className={labelCls}>Región</label><input value={newBranch.region} onChange={(e) => setNewBranch((p) => ({ ...p, region: e.target.value }))} className={inputCls} placeholder="Región o ciudad" disabled={!canEdit} /></div>
                  <div><label className={labelCls}>Emoji</label><input value={newBranch.icon} onChange={(e) => setNewBranch((p) => ({ ...p, icon: e.target.value }))} className={inputCls} placeholder="🏬" disabled={!canEdit} /></div>
                  <div><label className={labelCls}>Color UI</label><input value={newBranch.color} onChange={(e) => setNewBranch((p) => ({ ...p, color: e.target.value }))} className={inputCls} placeholder="slate, emerald, violet..." disabled={!canEdit} /></div>
                  <div><label className={labelCls}>Encargado</label><input value={newBranch.managerEmail} onChange={(e) => setNewBranch((p) => ({ ...p, managerEmail: e.target.value }))} className={inputCls} placeholder="encargado@empresa.com" disabled={!canEdit} /></div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Imagen de sede</label>
                    <ImageUploader value={newBranch.imageUrl} onChange={(v) => setNewBranch((p) => ({ ...p, imageUrl: v }))} fallback={newBranch.icon || '🏬'} shape="landscape" disabled={!canEdit} slot="branch" />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-600">
                    <input type="checkbox" checked={newBranch.active} onChange={(e) => setNewBranch((p) => ({ ...p, active: e.target.checked }))} className="accent-slate-700" disabled={!canEdit} /> Activar de inmediato
                  </label>
                  <div className="flex gap-2">
                    <button onClick={addBranch} disabled={!canEdit} className={`${btnPrimary} !text-[12px]`}>Crear</button>
                    <button onClick={() => { setShowNewBranch(false); setNewBranch(createEmptyBranch()) }} className={`${btnSecondary} !text-[12px]`}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
              {form.branches.map((b) => (
                <article key={b.slug} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="relative flex items-center gap-3 p-3 border-b border-slate-100">
                    <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200/60">
                      {b.imageUrl ? <img src={b.imageUrl} alt={b.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">{b.icon}</div>}
                      <div className="absolute bottom-0.5 right-0.5 inline-flex items-center justify-center rounded-full bg-white/95 h-5 w-5 text-[12px] shadow-sm">{b.icon}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 font-mono">{b.slug}</span>
                        <label className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold shadow-sm cursor-pointer ${b.active ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                          <input type="checkbox" checked={b.active} onChange={(e) => setBranch(b.slug, 'active', e.target.checked)} disabled={!canEdit} className="accent-emerald-500 h-3 w-3" /> {b.active ? 'Activa' : 'Pausada'}
                        </label>
                      </div>
                      <div className="mt-1 truncate text-[15px] sm:text-base font-black text-slate-900">{b.name || 'Sin nombre'}</div>
                      <div className="truncate text-[11px] text-slate-500">{b.region || 'Sin región definida'}</div>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="mb-3 grid gap-1.5 grid-cols-3">
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Color</div><div className="mt-0.5 truncate text-[11px] font-bold text-slate-700">{b.color || 'slate'}</div></div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Manager</div><div className="mt-0.5 truncate text-[11px] font-bold text-slate-700">{b.managerEmail ? b.managerEmail.split('@')[0] : '—'}</div></div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Ruta</div><div className="mt-0.5 truncate text-[11px] font-bold text-slate-700 font-mono">/{b.slug}</div></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className={labelCls}>Nombre</label><input value={b.name} onChange={(e) => setBranch(b.slug, 'name', e.target.value)} className={inputCls} disabled={!canEdit} /></div>
                      <div><label className={labelCls}>Región</label><input value={b.region} onChange={(e) => setBranch(b.slug, 'region', e.target.value)} className={inputCls} disabled={!canEdit} /></div>
                      <div><label className={labelCls}>Emoji</label><input value={b.icon} onChange={(e) => setBranch(b.slug, 'icon', e.target.value)} className={inputCls} disabled={!canEdit} /></div>
                      <div><label className={labelCls}>Color UI</label><input value={b.color} onChange={(e) => setBranch(b.slug, 'color', e.target.value)} className={inputCls} placeholder="slate, emerald, violet..." disabled={!canEdit} /></div>
                      <div className="sm:col-span-2"><label className={labelCls}>Encargado</label><input value={b.managerEmail} onChange={(e) => setBranch(b.slug, 'managerEmail', e.target.value)} className={inputCls} placeholder="email@empresa.com" disabled={!canEdit} /></div>
                      <div className="sm:col-span-2"><label className={labelCls}>Imagen de sede</label><ImageUploader value={b.imageUrl} onChange={(v) => setBranch(b.slug, 'imageUrl', v)} fallback={b.icon} shape="landscape" disabled={!canEdit} hidePreview slot="branch" /></div>
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                      <button onClick={() => removeBranch(b.slug)} disabled={!canEdit} className={`${btnSecondary} !text-[12px] !text-rose-600 hover:!bg-rose-50`}><Trash2 size={13} /> Eliminar sucursal</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Section>
        )
      case 'users':
        return (
          <Section icon={<Users size={18} />} title="Usuarios y roles" subtitle={`Crea cuentas para los trabajadores. Asigna módulos (Web, POS, ERP) y sucursales. ${users.length} cuentas.`} tone="users">
            {/* Crear cuenta desde trabajador */}
            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50/80 via-white/60 to-violet-50/80 border border-fuchsia-200/50 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-fuchsia-500/10 to-violet-500/10 border-b border-fuchsia-100/60">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-sm">
                  <UserPlus size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-700">Crear cuenta</p>
                  <p className="text-[10px] text-slate-500">Selecciona un trabajador de la planilla y asígnale accesos</p>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Selector */}
                <div>
                  <label className={labelCls}>Trabajador</label>
                  <select
                    value={newAccount.trabajadorId}
                    onChange={(e) => {
                      const t = trabajadores.find(x => x.id === e.target.value)
                      setNewAccount(p => ({ ...p, trabajadorId: e.target.value, displayName: t?.nombre || '', photoURL: t?.fotoUrl || '', branchSlugs: t?.sede ? [t.sede] : [] }))
                    }}
                    className={inputCls}
                  >
                    <option value="">— Seleccionar trabajador —</option>
                    {loadingTrabajadores
                      ? <option disabled>Cargando...</option>
                      : trabajadores.map(t => {
                          const yaTieneCuenta = users.some(u => u.trabajadorId === t.id || u.displayName === t.nombre)
                          return <option key={t.id} value={t.id} disabled={yaTieneCuenta}>{t.nombre} — {t.cargo} ({t.sede}){yaTieneCuenta ? ' ✓' : ''}</option>
                        })
                    }
                  </select>
                </div>

                {newAccount.trabajadorId && (() => {
                  const t = trabajadores.find(x => x.id === newAccount.trabajadorId)
                  return (
                    <>
                      {/* Card del trabajador seleccionado */}
                      {t && (
                        <div className="flex items-center gap-3.5 rounded-2xl bg-gradient-to-r from-slate-50 to-fuchsia-50/30 border border-fuchsia-200/70 p-3.5 shadow-xs">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-fuchsia-300/80 bg-gradient-to-br from-fuchsia-500 to-indigo-600 shadow-sm">
                            <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-white select-none">
                              {(t.nombre || '?')[0].toUpperCase()}
                            </div>
                            {newAccount.photoURL ? (
                              <img
                                src={newAccount.photoURL}
                                alt={t.nombre}
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none' }}
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-black text-slate-900 truncate">{t.nombre}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {t.cargo && (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                  <Briefcase size={10} />
                                  <span>{t.cargo}</span>
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 border border-sky-200/70 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                                <MapPin size={10} />
                                <span>{form.branches.find(b => b.slug === t.sede)?.name || t.sede || 'Sin sede'}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Credenciales */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
                            <Mail size={13} className="text-slate-400" />
                            <span>Email para Acceso (Login)</span>
                          </label>
                          <input
                            type="email"
                            value={newAccount.email}
                            onChange={(e) => setNewAccount(p => ({ ...p, email: e.target.value }))}
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-bold focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none transition shadow-2xs"
                            placeholder="trabajador@empresa.com"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
                            <Lock size={13} className="text-slate-400" />
                            <span>Contraseña Temporal</span>
                          </label>
                          <input
                            type="password"
                            value={newAccount.password}
                            onChange={(e) => setNewAccount(p => ({ ...p, password: e.target.value }))}
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-bold focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none transition shadow-2xs"
                            placeholder="Mínimo 6 caracteres"
                          />
                        </div>
                      </div>

                      {/* Módulos con sub-permisos */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Layers size={13} className="text-fuchsia-500" />
                            <span>Módulos y Permisos</span>
                          </label>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
                            {newAccount.modules.length} activos
                          </span>
                        </div>
                        <div className="space-y-2">
                          {MODULE_TREE.map(group => {
                            const mainOn = newAccount.modules.includes(group.main) || group.sub.some(s => newAccount.modules.includes(s.id))
                            return (
                              <div key={group.main} className={`rounded-xl border transition ${mainOn ? 'border-fuchsia-300 bg-fuchsia-50/30' : 'border-slate-200 bg-white'}`}>
                                <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
                                  <span className="text-base">{group.icon}</span>
                                  <span className="text-[12px] font-bold text-slate-700">{group.label}</span>
                                  <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${mainOn ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-slate-100 text-slate-400'}`}>
                                    {mainOn ? 'ON' : 'OFF'}
                                  </span>
                                </div>
                                <div className="p-2 space-y-1.5">
                                  {group.sub.map(sub => {
                                    const on = newAccount.modules.includes(sub.id)
                                    return (
                                      <button
                                        type="button"
                                        key={sub.id}
                                        onClick={() => setNewAccount(p => {
                                          const s = new Set(p.modules)
                                          // Si activas pos_admin, desactiva pos (y viceversa)
                                          if (sub.id === 'pos_admin') s.delete('pos')
                                          if (sub.id === 'pos') s.delete('pos_admin')
                                          if (sub.id === 'erp_admin') s.delete('erp')
                                          if (sub.id === 'erp') s.delete('erp_admin')
                                          s.has(sub.id) ? s.delete(sub.id) : s.add(sub.id)
                                          return { ...p, modules: [...s] as AppModule[] }
                                        })}
                                        className={`w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${on ? 'border-fuchsia-400 bg-white ring-1 ring-fuchsia-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                                      >
                                        <div className={`h-4 w-4 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'border-fuchsia-500 bg-fuchsia-500' : 'border-slate-300'}`}>
                                          {on && <Check size={10} className="text-white" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className={`text-[11px] font-bold ${on ? 'text-fuchsia-900' : 'text-slate-600'}`}>{sub.label}</p>
                                          <p className="text-[9px] text-slate-400 truncate">{sub.desc}</p>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Pantalla predeterminada al iniciar sesión */}
                      {newAccount.modules.length > 1 && (() => {
                        const availableDefaults = MODULE_TREE
                          .filter(g => newAccount.modules.includes(g.main) || g.sub.some(s => newAccount.modules.includes(s.id)))
                          .flatMap(g => g.sub.filter(s => newAccount.modules.includes(s.id)))
                        return (
                          <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                              <ShieldCheck size={13} className="text-emerald-500" />
                              <span>Pantalla predeterminada al iniciar sesión</span>
                            </label>
                            <p className="text-[10px] text-slate-400 mb-2">Cuando el usuario tiene varios módulos, decide cuál ve primero al entrar.</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setNewAccount(p => ({ ...p, defaultModule: '' }))}
                                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                                  !newAccount.defaultModule
                                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                Auto (prioridad POS {'>'} ERP {'>'} Web)
                              </button>
                              {availableDefaults.map(m => (
                                <button
                                  type="button"
                                  key={m.id}
                                  onClick={() => setNewAccount(p => ({ ...p, defaultModule: m.id }))}
                                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                                    newAccount.defaultModule === m.id
                                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {MODULE_LABELS[m.id]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Sucursales */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <MapPin size={13} className="text-sky-500" />
                            <span>Sucursales Asignadas</span>
                          </label>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                            {newAccount.branchSlugs.length} sedes
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {form.branches.map((b) => {
                            const on = newAccount.branchSlugs.includes(b.slug)
                            return (
                              <button
                                type="button"
                                key={b.slug}
                                onClick={() => setNewAccount(p => {
                                  const s = new Set(p.branchSlugs)
                                  s.has(b.slug) ? s.delete(b.slug) : s.add(b.slug)
                                  return { ...p, branchSlugs: [...s] }
                                })}
                                className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                                  on
                                    ? 'border-sky-300/80 bg-sky-50 text-sky-900 shadow-xs ring-2 ring-sky-200/50'
                                    : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                <span className={`h-4 w-4 rounded-md flex items-center justify-center text-[10px] font-black transition ${
                                  on ? 'bg-sky-600 text-white' : 'border border-slate-300 text-transparent group-hover:border-slate-400'
                                }`}>
                                  ✓
                                </span>
                                <span className="truncate">{b.name}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={createAccount}
                          disabled={!newAccount.email || !newAccount.password || !!creatingAccount}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:shadow-md active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {creatingAccount ? <><Loader2 size={14} className="animate-spin" /> Creando cuenta...</> : <><UserPlus size={14} /> Crear cuenta</>}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewAccount({ trabajadorId: '', email: '', password: '', displayName: '', photoURL: '', modules: ['erp'], branchSlugs: [], defaultModule: '' })}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 active:scale-95 transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Lista de usuarios existentes */}
            <div className="mt-4 space-y-3">
              {loadingUsers ? <div className="py-6 text-center text-[13px] text-slate-400">Cargando usuarios...</div>
              : users.length === 0 ? <div className="py-6 text-center text-[13px] text-slate-400">Sin cuentas creadas todavía.</div>
              : users.map((u) => {
                const isSup = u.email === (supremeEmail || savedSupremeEmail)
                const trabajador = trabajadores.find(t => t.id === u.trabajadorId || (u.displayName && t.nombre?.trim().toLowerCase() === u.displayName.trim().toLowerCase()))
                const userPhoto = u.photoURL || trabajador?.fotoUrl || ''
                const moduleCount = (u.modules || []).length
                const branchMatch = form.branches.find(b => b.slug === trabajador?.sede || (u.branchSlugs || []).includes(b.slug))
                const branchName = branchMatch ? branchMatch.name : (trabajador?.sede ? trabajador.sede.replace(/-/g, ' ').toUpperCase() : 'Sin sucursal asignada')

                return (
                  <div key={u.email} className="group relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:shadow-xl hover:border-fuchsia-300/70 transition-all duration-300">
                    {/* Top Accent Strip */}
                    <div className={`h-1.5 w-full bg-gradient-to-r ${isSup ? 'from-amber-400 via-orange-400 to-yellow-500' : 'from-fuchsia-500 via-purple-500 to-indigo-500'}`} />

                    <div className="grid lg:grid-cols-[290px_1fr]">
                      {/* ═══ COLUMNA IDENTIDAD ═══ */}
                      <div className="relative border-b border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-fuchsia-50/30 p-5 text-slate-800 lg:border-b-0 lg:border-r lg:border-slate-200/80 flex flex-col justify-between">
                        <div className="absolute right-4 top-4 h-24 w-24 rounded-full bg-fuchsia-200/30 blur-2xl pointer-events-none" />

                        <div>
                          <div className="relative flex items-center lg:items-start gap-4 lg:flex-col">
                            {/* Avatar con bolita de conectado AFUERA del marco */}
                            <div className="relative shrink-0">
                              <div className="relative h-18 w-18 lg:h-20 lg:w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-fuchsia-200/90 bg-gradient-to-br from-fuchsia-500 to-indigo-600 shadow-md">
                                <div className="absolute inset-0 flex items-center justify-center text-2xl lg:text-3xl font-black text-white select-none">
                                  {(u.displayName || u.email || '?')[0].toUpperCase()}
                                </div>
                                {userPhoto ? (
                                  <img
                                    src={userPhoto}
                                    alt={u.displayName}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                  />
                                ) : null}
                              </div>
                              {/* Bolita verde de estado conectada/activa AFUERA del marco */}
                              <div
                                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white shadow-md z-10 ${
                                  u.hasAccount ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                                title={u.hasAccount ? 'Cuenta activa' : 'Sin cuenta'}
                              />
                            </div>

                            {/* Info de usuario */}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h3 className="truncate text-base lg:text-lg font-black text-slate-900 leading-tight">
                                  {u.displayName || u.email.split('@')[0]}
                                </h3>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider border shadow-2xs ${
                                  isSup
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : (ROLE_COLORS[u.role] || 'border-slate-200 bg-slate-100 text-slate-700')
                                }`}>
                                  {isSup ? '👑 Supremo' : (ROLE_LABELS[u.role] || '👷 Trabajador')}
                                </span>
                              </div>

                              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 truncate font-medium">
                                <Mail size={11} className="text-slate-400 shrink-0" />
                                <span className="truncate">{u.email}</span>
                              </p>

                              {/* Chips de Cargo y Sede elegantes */}
                              {(trabajador || (u.branchSlugs && u.branchSlugs.length > 0)) && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {trabajador?.cargo && (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-50/80 px-2.5 py-1 text-[11px] font-bold text-indigo-700 shadow-2xs">
                                      <Briefcase size={11} />
                                      <span>{trabajador.cargo}</span>
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 text-[11px] font-bold text-sky-700 shadow-2xs">
                                    <MapPin size={11} />
                                    <span>{branchName}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Footer de estado */}
                        <div className="relative mt-4 flex items-center justify-between border-t border-slate-200/70 pt-3 text-[11px]">
                          <span className="text-slate-500 font-medium">Estado de cuenta</span>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border shadow-2xs ${
                            u.hasAccount
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${u.hasAccount ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            {u.hasAccount ? 'Activa con acceso' : 'Sin cuenta creada'}
                          </span>
                        </div>
                      </div>

                      {/* ═══ COLUMNA PERMISOS Y CONFIGURACIÓN ═══ */}
                      <div className="min-w-0 p-5 space-y-4 flex flex-col justify-between">
                        {/* Cabecera */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-lg bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center font-bold text-xs">
                                <ShieldCheck size={14} />
                              </div>
                              <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
                                Permisos de Acceso y Módulos
                              </p>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1 font-bold text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded-md border border-fuchsia-100">
                                {moduleCount} {moduleCount === 1 ? 'módulo habilitado' : 'módulos habilitados'}
                              </span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                                {(u.branchSlugs || []).length} {((u.branchSlugs || []).length === 1) ? 'sucursal' : 'sucursales'}
                              </span>
                            </div>
                          </div>
                          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                            <CheckCircle2 size={11} className="text-emerald-500" />
                            Acceso configurado
                          </span>
                        </div>

                        {/* Módulos Habilitados con sub-permisos */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                            <Layers size={12} className="text-slate-400" />
                            <span>Módulos y Permisos</span>
                          </label>
                          <div className="space-y-2">
                            {MODULE_TREE.map(group => {
                              const mainOn = (u.modules || []).includes(group.main) || group.sub.some(s => (u.modules || []).includes(s.id))
                              return (
                                <div key={group.main} className={`rounded-xl border transition ${mainOn ? 'border-fuchsia-300 bg-fuchsia-50/30' : 'border-slate-200 bg-white'}`}>
                                  <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
                                    <span className="text-base">{group.icon}</span>
                                    <span className="text-[12px] font-bold text-slate-700">{group.label}</span>
                                    <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${mainOn ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-slate-100 text-slate-400'}`}>
                                      {mainOn ? 'ON' : 'OFF'}
                                    </span>
                                  </div>
                                  <div className="p-2 space-y-1.5">
                                    {group.sub.map(sub => {
                                      const on = (u.modules || []).includes(sub.id)
                                      return (
                                        <button
                                          type="button"
                                          key={sub.id}
                                          disabled={!canEdit || isSup}
                                          onClick={() => {
                                            setUsers(p => p.map(x => {
                                              if (x.email !== u.email) return x
                                              const s = new Set(x.modules || ['erp'])
                                              if (sub.id === 'pos_admin') s.delete('pos')
                                              if (sub.id === 'pos') s.delete('pos_admin')
                                              if (sub.id === 'erp_admin') s.delete('erp')
                                              if (sub.id === 'erp') s.delete('erp_admin')
                                              s.has(sub.id) ? s.delete(sub.id) : s.add(sub.id)
                                              return { ...x, modules: [...s] as AppModule[] }
                                            }))
                                          }}
                                          className={`w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${on ? 'border-fuchsia-400 bg-white ring-1 ring-fuchsia-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'} ${!canEdit || isSup ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                        >
                                          <div className={`h-4 w-4 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'border-fuchsia-500 bg-fuchsia-500' : 'border-slate-300'}`}>
                                            {on && <Check size={10} className="text-white" />}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className={`text-[11px] font-bold ${on ? 'text-fuchsia-900' : 'text-slate-600'}`}>{sub.label}</p>
                                            <p className="text-[9px] text-slate-400 truncate">{sub.desc}</p>
                                          </div>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Pantalla predeterminada al iniciar sesión */}
                        {(u.modules || []).length > 1 && (() => {
                          const availableDefaults = MODULE_TREE
                            .filter(g => (u.modules || []).includes(g.main) || g.sub.some(s => (u.modules || []).includes(s.id)))
                            .flatMap(g => g.sub.filter(s => (u.modules || []).includes(s.id)))
                          return (
                            <div>
                              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                                <ShieldCheck size={12} className="text-emerald-500" />
                                <span>Pantalla predeterminada al iniciar sesión</span>
                              </label>
                              <p className="text-[10px] text-slate-400 mb-2">Cuando el usuario tiene varios módulos, decide cuál ve primero al entrar.</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={!canEdit || isSup}
                                  onClick={() => {
                                    setUsers(p => p.map(x => x.email === u.email ? { ...x, defaultModule: '' } : x))
                                  }}
                                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                                    !u.defaultModule
                                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  } ${!canEdit || isSup ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  Auto (prioridad POS {'>'} ERP {'>'} Web)
                                </button>
                                {availableDefaults.map(m => (
                                  <button
                                    type="button"
                                    key={m.id}
                                    disabled={!canEdit || isSup}
                                    onClick={() => {
                                      setUsers(p => p.map(x => x.email === u.email ? { ...x, defaultModule: m.id } : x))
                                    }}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                                      u.defaultModule === m.id
                                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    } ${!canEdit || isSup ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                  >
                                    {MODULE_LABELS[m.id]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })()}

                        {/* Sucursales Asignadas */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                            <Store size={12} className="text-slate-400" />
                            <span>Sucursales Asignadas</span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {form.branches.map(b => {
                              const on = (u.branchSlugs || []).includes(b.slug)
                              return (
                                <button
                                  type="button"
                                  key={b.slug}
                                  disabled={!canEdit}
                                  onClick={() => {
                                    setUsers(p => p.map(x => {
                                      if (x.email !== u.email) return x
                                      const s = new Set(x.branchSlugs || [])
                                      s.has(b.slug) ? s.delete(b.slug) : s.add(b.slug)
                                      return { ...x, branchSlugs: [...s] }
                                    }))
                                  }}
                                  className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                                    on
                                      ? 'border-sky-300/80 bg-sky-50 text-sky-900 shadow-xs ring-2 ring-sky-200/50'
                                      : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                  } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                                >
                                  <span className={`h-4 w-4 rounded-md flex items-center justify-center text-[10px] font-black transition ${
                                    on ? 'bg-sky-600 text-white' : 'border border-slate-300 text-transparent group-hover:border-slate-400'
                                  }`}>
                                    ✓
                                  </span>
                                  <span className="truncate">{b.name}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Campos Editables */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
                              <User size={13} className="text-slate-400" />
                              <span>Nombre del Usuario</span>
                            </label>
                            <input
                              type="text"
                              value={u.displayName}
                              onChange={e => setUsers(p => p.map(x => x.email === u.email ? { ...x, displayName: e.target.value } : x))}
                              placeholder="Nombre para mostrar"
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-bold focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none transition shadow-2xs"
                              disabled={!canEdit}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between gap-1.5 mb-1.5">
                              <span className="flex items-center gap-1.5">
                                <Mail size={13} className="text-slate-400" />
                                <span>Email de Acceso (Login)</span>
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                                <Lock size={9} /> ID Único
                              </span>
                            </label>
                            <input
                              type="email"
                              value={u.email}
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/80 text-slate-500 text-xs font-semibold cursor-not-allowed select-none outline-none"
                              disabled
                            />
                          </div>
                        </div>

                        {/* Barra de Acciones */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5">
                          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                            <Shield size={13} className="text-slate-400" />
                            <span>Nivel: <strong className="text-slate-700 font-bold">{isSup ? '👑 Administrador Supremo' : (ROLE_LABELS[u.role] || 'Trabajador')}</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => deleteUser(u.email)}
                              disabled={!canEdit || isSup}
                              title="Eliminar cuenta de acceso"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-600 shadow-2xs hover:bg-rose-50 active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none"
                            >
                              <Trash2 size={13} />
                              <span>Eliminar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => saveUser(u)}
                              disabled={!canEdit || savingUser === u.email}
                              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 hover:from-black hover:to-slate-900 px-4 py-2 text-[11px] font-bold text-white shadow-sm hover:shadow-md active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none"
                            >
                              {savingUser === u.email ? (
                                <><Loader2 size={13} className="animate-spin text-fuchsia-400" /> Guardando...</>
                              ) : (
                                <><Save size={13} /> Guardar cambios</>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Factory Reset */}
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 mb-2"><Trash2 size={16} className="text-red-600" /><div className="text-[13px] font-bold text-red-800">Factory Reset — Borrar configuración</div></div>
              <div className="text-[11px] text-red-700/80 mb-3">Elimina la configuración de Admin Supreme (marca, operador, sucursales). <b>No se puede deshacer.</b></div>
              <button type="button" disabled={!canEdit} onClick={async () => {
                if (!canEdit) return
                const pass = prompt('⚠️ FACTORY RESET — Escribe "BORRAR TODO" para confirmar:')
                if (pass !== 'BORRAR TODO') { setStatus('Factory Reset cancelado.'); return }
                setStatus('🔄 Borrando datos...')
                try { await deleteConfig(); setStatus('✅ Factory Reset completo. Recargando...'); setTimeout(() => window.location.reload(), 1500) }
                catch (e: any) { setStatus(`❌ Error en Factory Reset: ${e?.message || e}`) }
              }} className={`w-full py-2.5 rounded-lg border border-red-300 bg-red-100 text-red-800 text-[12px] font-bold transition ${!canEdit ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-200 hover:border-red-400 cursor-pointer'}`}>🗑️ Factory Reset</button>
            </div>
          </Section>
        )
    }
  })()

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header sticky tipo ERP */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/erp-dashboard" className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100 transition">
              <ArrowLeft size={18} className="text-slate-600" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-white shadow-xs">
                <Waypoints size={16} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold text-slate-900 truncate">Admin Supreme</h1>
                <p className="text-[10px] text-slate-500 truncate">Panel de control multiempresa</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider">En línea</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
              <span className={`h-1.5 w-1.5 rounded-full ${canEdit ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{canEdit ? 'Edición' : 'Lectura'}</span>
            </div>
            {status && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 size={12} /> {status}
              </span>
            )}
            {/* Atajos rápidos */}
            <Link href="/cuadres" className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold transition hover:bg-rose-100" title="Cuadres">
              <ClipboardList size={14} />
              <span>Cuadres</span>
            </Link>
            <Link href="/pos-admin" className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold transition hover:bg-blue-100" title="POS">
              <ShoppingCart size={14} />
              <span>POS</span>
            </Link>
            <Link href="/erp-dashboard/base-datos" className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-semibold transition hover:bg-cyan-100" title="Base de Datos">
              <Database size={14} />
              <span>BD</span>
            </Link>
            <button onClick={handleSave} disabled={!canEdit} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-bold text-white shadow-xs transition hover:bg-slate-900 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none">
              <Save size={13} /> Guardar
            </button>
            <button onClick={handleReset} disabled={!canEdit} title="Restaurar" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600 transition hover:bg-slate-50 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 py-4">
        {/* Stats row */}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mb-4">
          <Stat label="Mi Tienda" value={form.companyName || 'Sin nombre'} icon={<Store size={14} />} gradient="from-blue-500 to-indigo-600" />
          <Stat label="Sedes activas" value={`${activeCount}/${form.branches.length}`} icon={<Store size={14} />} gradient="from-emerald-500 to-teal-600" />
          <Stat label="Usuarios" value={`${users.length}`} icon={<Users size={14} />} gradient="from-fuchsia-500 to-violet-600" />
          <Stat label="Tu rol" value={ROLE_LABELS[myRole]} icon={<Crown size={14} />} gradient="from-amber-500 to-orange-600" />
        </div>

        {/* Nav mobile */}
        <div className="xl:hidden mb-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {sectionItems.map((item) => {
              const active = item.key === activeSection
              const style = SECTION_STYLES[item.key]
              return (
                <button key={item.key} type="button" onClick={() => setActiveSection(item.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all whitespace-nowrap ${active ? `${style.icon}` : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {item.icon} {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          {/* Sidebar desktop */}
          <aside className="hidden xl:block xl:sticky xl:top-[68px] xl:self-start">
            <nav className="space-y-1">
              {sectionItems.map((item) => {
                const active = item.key === activeSection
                const style = SECTION_STYLES[item.key]
                return (
                  <button key={item.key} type="button" onClick={() => setActiveSection(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all border ${active ? 'ring-2 ring-slate-300 shadow-xs ' + style.icon : 'border-transparent hover:bg-white hover:border-slate-200 bg-transparent'}`}>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[12px] font-bold truncate ${active ? 'text-white' : 'text-slate-700'}`}>{item.label}</div>
                      <div className={`truncate text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{item.detail}</div>
                    </div>
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* Content */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${SECTION_STYLES[activeSection].icon}`}>{activeSectionMeta.icon}</div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold text-slate-900 truncate">{activeSectionMeta.detail}</h2>
                  <p className="text-[11px] text-slate-500">{activeSectionMeta.label}</p>
                </div>
                <div className="hidden md:block rounded-lg border border-slate-100 bg-slate-50 px-3 py-1 text-right shrink-0">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Dato</div>
                  <div className="text-[11px] font-bold text-slate-900 truncate max-w-[160px]" title={String(activeSectionMeta.badge)}>{activeSectionMeta.badge}</div>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-5">{activeSectionContent}</div>
          </section>
        </div>
      </div>
      <AdminOnboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} obCompanyName={obCompanyName} setObCompanyName={setObCompanyName} obOwnerName={obOwnerName} setObOwnerName={setObOwnerName} obBranchName={obBranchName} setObBranchName={setObBranchName} obBranchSlug={obBranchSlug} setObBranchSlug={setObBranchSlug} obBranchImage={obBranchImage} setObBranchImage={setObBranchImage} obSparkMode={obSparkMode} setObSparkMode={setObSparkMode} obLogoUrl={obLogoUrl} setObLogoUrl={setObLogoUrl} obAvatarUrl={obAvatarUrl} setObAvatarUrl={setObAvatarUrl} obGradient={obGradient} setObGradient={setObGradient} obWorkerName={obWorkerName} setObWorkerName={setObWorkerName} obWorkerNac={obWorkerNac} setObWorkerNac={setObWorkerNac} obWorkerGenero={obWorkerGenero} setObWorkerGenero={setObWorkerGenero} onFinish={submitOnboarding} />
    </div>
  )
}
