'use client'

import React, { useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Calendar,
  Plus,
  Receipt,
  Save,
  Sparkles,
  Trash2,
  Wallet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { authReady, db } from '@/lib/firebase'
import { SEDES, SEDE_SLUGS, type SedeSlug } from '@/types'
import {
  addExternalExpenseEntry,
  buildExternalExpenseBreakdown,
  buildVisibleDateRange,
  deleteExternalExpenseEntry,
  type ExternalFixedExpense,
  type ExternalManualExpense,
  loadExternalExpensesConfig,
  saveExternalExpensesConfig,
  listExternalExpenseEntriesForMonth,
} from '@/lib/externalExpenses'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)

const formatMonth = (monthId: string) => {
  if (!monthId || !monthId.includes('-')) return monthId
  const [year, month] = monthId.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString('es-CL', {
    month: 'long',
    year: 'numeric',
  })
}

function currentMonthId() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'amber' | 'rose' | 'emerald' | 'indigo'
}) {
  const tones = {
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',
    rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800',
  }

  return (
    <div className={`p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md ${tones[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-wider opacity-75">{title}</div>
      <div className="text-2xl font-black mt-2 tracking-tight">{value}</div>
    </div>
  )
}

function GastosExternosContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const defaultSede = (SEDE_SLUGS && SEDE_SLUGS[0]) ? SEDE_SLUGS[0] : 'donbalato-central'
  const paramSede = searchParams.get('sede')
  const initialSede: SedeSlug = paramSede && SEDE_SLUGS.includes(paramSede as SedeSlug) ? (paramSede as SedeSlug) : defaultSede
  const initialMonth = searchParams.get('month') && /^\d{4}-\d{2}$/.test(searchParams.get('month')!)
    ? searchParams.get('month')!
    : currentMonthId()

  const [selectedSede, setSelectedSede] = useState<SedeSlug>(initialSede)
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [fixedExpenses, setFixedExpenses] = useState<ExternalFixedExpense[]>([])
  const [manualExpenses, setManualExpenses] = useState<ExternalManualExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [savingFixed, setSavingFixed] = useState(false)
  const [saveFixedSuccess, setSaveFixedSuccess] = useState(false)
  const [addingManual, setAddingManual] = useState(false)
  const [form, setForm] = useState({
    date: `${initialMonth}-01`,
    reason: '',
    amount: '',
    category: 'Gasto externo',
  })

  // Synchronize state to URL without full reloads
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedSede) params.set('sede', selectedSede)
    if (selectedMonth) params.set('month', selectedMonth)
    const newUrl = `/erp-dashboard/gastos-externos?${params.toString()}`
    window.history.replaceState(null, '', newUrl)
  }, [selectedMonth, selectedSede])

  const loadData = async () => {
    if (!db || !selectedSede) return
    setLoading(true)
    try {
      await authReady
      const [fixed, manual] = await Promise.all([
        loadExternalExpensesConfig(db, selectedSede),
        listExternalExpenseEntriesForMonth(db, selectedSede, selectedMonth),
      ])

      setFixedExpenses(fixed)
      setManualExpenses(manual)
      setForm((prev) => ({
        ...prev,
        date: prev.date.startsWith(`${selectedMonth}-`) ? prev.date : `${selectedMonth}-01`,
      }))
    } catch (err) {
      console.error('[GastosExternos] Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedSede])

  const monthDates = useMemo(() => buildVisibleDateRange(selectedMonth, 'full'), [selectedMonth])

  const breakdown = useMemo(() => {
    return buildExternalExpenseBreakdown(selectedMonth, monthDates, fixedExpenses, manualExpenses)
  }, [fixedExpenses, manualExpenses, monthDates, selectedMonth])

  const updateFixedItem = (id: string, patch: Partial<ExternalFixedExpense>) => {
    setFixedExpenses((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const handleAddFixedItem = () => {
    const nextId = `${selectedSede}-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFixedExpenses((prev) => [
      ...prev,
      {
        id: nextId,
        name: 'Nuevo gasto fijo',
        amount: 0,
        active: true,
        category: 'Gasto fijo',
      },
    ])
  }

  const handleRemoveFixedItem = (id: string) => {
    setFixedExpenses((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSaveFixed = async () => {
    if (!db) return
    setSavingFixed(true)
    setSaveFixedSuccess(false)
    try {
      await authReady
      const saved = await saveExternalExpensesConfig(db, selectedSede, fixedExpenses)
      setFixedExpenses(saved)
      setSaveFixedSuccess(true)
      setTimeout(() => setSaveFixedSuccess(false), 3000)
    } catch (err) {
      console.error('Error guardando gastos fijos:', err)
      alert('Error al guardar los gastos fijos.')
    } finally {
      setSavingFixed(false)
    }
  }

  const handleAddManual = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!db) return
    if (!form.date || !form.reason.trim() || !Number(form.amount)) {
      alert('Por favor completa la fecha, el motivo y un monto válido.')
      return
    }

    setAddingManual(true)
    try {
      await authReady
      const created = await addExternalExpenseEntry(db, selectedSede, {
        date: form.date,
        reason: form.reason.trim(),
        amount: Number(form.amount),
        category: form.category.trim() || 'Gasto externo',
      })
      setManualExpenses((prev) =>
        [created, ...prev].sort((a, b) => a.date.localeCompare(b.date) || b.createdAtMs - a.createdAtMs),
      )
      setForm((prev) => ({
        ...prev,
        reason: '',
        amount: '',
      }))
    } catch (err) {
      console.error('Error agregando gasto manual:', err)
      alert('Error al registrar el gasto manual.')
    } finally {
      setAddingManual(false)
    }
  }

  const handleDeleteManual = async (id: string) => {
    if (!db) return
    if (!confirm('¿Estás seguro de eliminar este registro de gasto manual?')) return
    try {
      await deleteExternalExpenseEntry(db, selectedSede, id)
      setManualExpenses((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      console.error('Error eliminando gasto manual:', err)
      alert('Error al eliminar el gasto.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors">
      <div className="w-full px-4 py-4 md:px-8 md:py-8 max-w-[1600px] mx-auto">
        {/* Header bar */}
        <div className="mb-6 rounded-3xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 px-6 py-5 shadow-xl flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between transition-all">
          <div className="flex items-center gap-4">
            <Link
              href="/erp-dashboard"
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700 transition-all hover:scale-105"
              aria-label="Volver al dashboard"
            >
              <ArrowLeft size={20} className="text-slate-700 dark:text-slate-300" />
            </Link>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-lg">
              <Receipt size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Gastos Externos
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Gastos fijos y extraordinarios fuera de cuadre diario para balance mensual
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl px-3.5 py-2">
              <Building2 size={16} className="text-slate-500 dark:text-slate-400" />
              <select
                value={selectedSede}
                onChange={(e) => setSelectedSede(e.target.value as SedeSlug)}
                className="bg-transparent text-slate-800 dark:text-slate-200 text-sm font-semibold outline-none cursor-pointer"
              >
                {SEDE_SLUGS.map((slug) => (
                  <option key={slug} value={slug} className="text-slate-800">
                    {SEDES[slug] || slug}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl px-3.5 py-2">
              <Calendar size={16} className="text-slate-500 dark:text-slate-400" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 text-sm font-semibold outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition"
              title="Actualizar datos"
              type="button"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <MetricCard title="Gastos Fijos del Mes" value={formatCurrency(breakdown.fixedVisibleTotal)} tone="amber" />
          <MetricCard title="Gastos Manuales del Mes" value={formatCurrency(breakdown.manualVisibleTotal)} tone="rose" />
          <MetricCard title="Total Gastos Externos" value={formatCurrency(breakdown.totalVisible)} tone="emerald" />
          <MetricCard title="Período Activo" value={formatMonth(selectedMonth)} tone="indigo" />
        </div>

        {/* Main 2-column layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 mb-8">
          {/* Section 1: Gastos Fijos por Local */}
          <div className="rounded-3xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 mb-6 flex-col sm:flex-row sm:items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 text-[11px] font-black uppercase tracking-wider mb-2">
                  <Sparkles size={13} />
                  Base Mensual Fija
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Gastos Fijos ({SEDES[selectedSede] || selectedSede})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Se prorratean en el mes y se suman automáticamente al informe mensual.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleAddFixedItem}
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-700 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-xs font-bold rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/30 transition shadow-sm"
                >
                  <Plus size={14} />
                  Agregar
                </button>
                <button
                  onClick={handleSaveFixed}
                  disabled={savingFixed}
                  type="button"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition"
                >
                  {savingFixed ? (
                    <>
                      <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Guardando...
                    </>
                  ) : saveFixedSuccess ? (
                    <>
                      <CheckCircle2 size={14} />
                      ¡Guardado!
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      Guardar Fijos
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-3.5">
              {fixedExpenses.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    item.active
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40'
                      : 'border-slate-200/50 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <input
                        value={item.name}
                        onChange={(e) => updateFixedItem(item.id, { name: e.target.value })}
                        placeholder="Concepto del gasto fijo"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-sm outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      {(item.startMonth || item.endMonth) && (
                        <p className="mt-1 px-1 text-[10px] text-slate-400">
                          {item.startMonth ? `Desde ${item.startMonth}` : 'Histórico'}
                          {item.endMonth ? ` · hasta ${item.endMonth}` : ''}
                        </p>
                      )}
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={(e) => updateFixedItem(item.id, { active: e.target.checked })}
                        className="h-4 w-4 rounded accent-amber-600"
                      />
                      Activo
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <input
                        value={item.category}
                        onChange={(e) => updateFixedItem(item.id, { category: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs outline-none"
                        placeholder="Categoría"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                        <input
                          type="number"
                          value={item.amount || ''}
                          onChange={(e) => updateFixedItem(item.id, { amount: Number(e.target.value) })}
                          className="w-full pl-7 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 text-right"
                          placeholder="0"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveFixedItem(item.id)}
                        type="button"
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition"
                        title="Eliminar gasto fijo"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {fixedExpenses.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No hay gastos fijos registrados para esta sucursal. Haz clic en "Agregar" para crear uno.
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Gastos Manuales del Mes */}
          <div className="rounded-3xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-6 shadow-xl flex flex-col">
            <div className="mb-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 px-3 py-1 text-[11px] font-black uppercase tracking-wider mb-2">
                <Receipt size={13} />
                Registros Extraordinarios
              </div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                Gastos Manuales del Mes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Gastos únicos fuera de caja (reparaciones urgentes, pagos centralizados, fletes).
              </p>
            </div>

            {/* Quick Add Form */}
            <form onSubmit={handleAddManual} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-4 mb-5">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                + Nuevo Gasto Manual
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Categoría</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    placeholder="Ej. Mantención, Flete, etc."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_auto] gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Motivo / Descripción</label>
                  <input
                    type="text"
                    value={form.reason}
                    onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                    placeholder="Descripción del pago..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-rose-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Monto ($)</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold outline-none focus:ring-2 focus:ring-rose-400 text-right"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingManual}
                  className="px-4 py-2 bg-gradient-to-r from-rose-500 to-red-600 text-white text-xs font-bold rounded-xl shadow hover:shadow-md transition disabled:opacity-60 h-[34px] flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} />
                  {addingManual ? 'Agregando...' : 'Registrar'}
                </button>
              </div>
            </form>

            {/* List of Manual Expenses */}
            <div className="flex-1 overflow-y-auto max-h-[450px] space-y-2.5 pr-1">
              {manualExpenses.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-xs hover:border-slate-300 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {entry.date}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                        {entry.category}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {entry.reason}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                      {formatCurrency(entry.amount)}
                    </span>
                    <button
                      onClick={() => handleDeleteManual(entry.id)}
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                      title="Eliminar registro"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}

              {manualExpenses.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No hay gastos manuales extraordinarios registrados en este mes.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GastosExternosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="text-center">
            <div className="h-8 w-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Cargando gastos externos...</p>
          </div>
        </div>
      }
    >
      <GastosExternosContent />
    </Suspense>
  )
}
