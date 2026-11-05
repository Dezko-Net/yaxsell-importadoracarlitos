'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Trash2, Loader2, Save, Wallet, CreditCard,
  ArrowLeftRight, HandCoins, Scale, RefreshCw, Zap
} from 'lucide-react'
import { SEDES, SedeSlug } from '@/types'
import { matchBranchSlug } from '@/lib/posBranchAccess'
import { createCuadreERP, type CuadreGasto } from '@/lib/cuadresErpService'
import { sumarGastosMercaderia, sumarGastosQueAfectanGanancia } from '@/lib/gastosProfit'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0))

const SEDE_KEYS = Object.keys(SEDES) as SedeSlug[]
const todayCL = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

type GastoDraft = { monto: string; observacion: string; tipo: 'Operacional' | 'Gasto de mercadería' }

export default function NuevoCuadrePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [loadingPos, setLoadingPos] = useState(false)
  const [posSuccessMsg, setPosSuccessMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sede, setSede] = useState<SedeSlug>('donbalato-central')
  const [fecha, setFecha] = useState<string>(todayCL())
  const [efectivoSistema, setEfectivoSistema] = useState('')
  const [efectivoReal, setEfectivoReal] = useState('')
  const [debitoSistema, setDebitoSistema] = useState('')
  const [debitoReal, setDebitoReal] = useState('')
  const [transferencias, setTransferencias] = useState('')
  const [gastos, setGastos] = useState<GastoDraft[]>([])

  const num = (v: string) => Number(v) || 0

  const calc = useMemo(() => {
    const efSis = num(efectivoSistema), efReal = num(efectivoReal)
    const debSis = num(debitoSistema), debReal = num(debitoReal)
    const transf = num(transferencias)
    const gastosDetalle = gastos.map((g) => ({
      monto: num(g.monto),
      tipo: g.tipo,
      categoria: g.tipo === 'Gasto de mercadería' ? 'Inventario / Mercadería' : 'Otros',
    }))
    const gastosTotales = gastosDetalle.reduce((s, g) => s + g.monto, 0)
    const gastosMercaderia = sumarGastosMercaderia(gastosDetalle)
    const gastosQueAfectanGanancia = sumarGastosQueAfectanGanancia(gastosDetalle)
    const totalBruto = efSis + debSis + transf
    const totalNeto = totalBruto - gastosTotales
    const diferenciaEfectivo = efSis - efReal
    const diferenciaDebito = debSis - debReal
    const diferenciaTotal = diferenciaEfectivo + diferenciaDebito
    return { gastosTotales, gastosMercaderia, gastosQueAfectanGanancia, totalBruto, totalNeto, diferenciaEfectivo, diferenciaDebito, diferenciaTotal }
  }, [efectivoSistema, efectivoReal, debitoSistema, debitoReal, transferencias, gastos])

  const addGasto = () => setGastos(prev => [...prev, { monto: '', observacion: '', tipo: 'Operacional' }])
  const updGasto = (i: number, k: keyof GastoDraft, v: string) =>
    setGastos(prev => prev.map((g, idx) => idx === i ? { ...g, [k]: v } : g))
  const delGasto = (i: number) => setGastos(prev => prev.filter((_, idx) => idx !== i))

  const handlePreloadFromPOS = async () => {
    setLoadingPos(true)
    setError(null)
    setPosSuccessMsg(null)
    try {
      // 1. Intentar leer de reportes ya cerrados de POS para la fecha y sede
      if (fecha) {
        const reportRef = doc(db, 'sedes', sede, 'reports', fecha)
        const reportSnap = await getDoc(reportRef)
        if (reportSnap.exists()) {
          const rData = reportSnap.data()
          const montos = rData.montos || {}
          const ef = Number(montos.efectivoSistema) || 0
          const efReal = Number(montos.efectivoReal) || 0
          const deb = Number(montos.debitoSistema) || 0
          const debReal = Number(montos.debitoReal) || 0
          const trans = Number(montos.transferencias) || 0
          setEfectivoSistema(String(ef))
          if (efReal > 0) setEfectivoReal(String(efReal))
          setDebitoSistema(String(deb))
          if (debReal > 0) setDebitoReal(String(debReal))
          setTransferencias(String(trans))
          setPosSuccessMsg(`Datos cargados del reporte de cierre POS (${rData.cajeroNombre || 'Cajero'}, ${rData.ventasCount || 0} ventas).`)
          return
        }
      }

      // 2. Intentar leer de caja_sesiones activa
      const sesionRef = doc(db, 'caja_sesiones', `active_${sede}`)
      const sesionSnap = await getDoc(sesionRef)

      if (sesionSnap.exists()) {
        const sData = sesionSnap.data()
        const ef = Number(sData.totalEfectivo) || 0
        const deb = Number(sData.totalDebito) || 0
        const trans = Number(sData.totalTransferencia) || 0
        const total = Number(sData.totalVentas) || 0

        setEfectivoSistema(String(ef))
        setDebitoSistema(String(deb))
        setTransferencias(String(trans))
        setPosSuccessMsg(`Datos cargados de sesión activa POS (${sData.ventasCount || 0} ventas, total ${fmtCLP(total)}).`)
        return
      }

      // 2. Si no hay sesión activa, consultar ventas_pos de esa fecha y sede
      const ventasRef = collection(db, 'ventas_pos')
      const q = query(
        ventasRef,
        where('fechaStr', '==', fecha),
        where('estado', '==', 'completada')
      )
      const snap = await getDocs(q)
      const matchingDocs = snap.docs.filter((d) => matchBranchSlug(d.data().sede || 'donbalato-central', sede))
      if (matchingDocs.length === 0) {
        setError(`No se encontraron ventas POS registradas para ${SEDES[sede] || sede} en la fecha ${fecha}.`)
        return
      }

      let ef = 0
      let deb = 0
      let trans = 0
      matchingDocs.forEach((d) => {
        const v = d.data()
        let pagos: Array<{ metodo?: string; monto?: number }> = []
        try {
          if (Array.isArray(v.pagos)) pagos = v.pagos
          else if (typeof v.pagosJson === 'string') pagos = JSON.parse(v.pagosJson)
        } catch {}

        if (pagos.length > 0) {
          for (const p of pagos) {
            const m = Number(p.monto) || 0
            if (p.metodo === 'efectivo') {
              const neto = Math.max(0, m - (Number(v.vuelto) || 0))
              ef += Math.min(neto, Number(v.total) || neto)
            } else if (p.metodo === 'debito' || p.metodo === 'tarjeta') {
              deb += Math.min(m, Number(v.total) || m)
            } else if (p.metodo === 'transferencia') {
              trans += Math.min(m, Number(v.total) || m)
            } else {
              ef += Math.min(m, Number(v.total) || m)
            }
          }
        } else {
          ef += Number(v.total) || 0
        }
      })

      setEfectivoSistema(String(ef))
      setDebitoSistema(String(deb))
      setTransferencias(String(trans))
      setPosSuccessMsg(`Datos calculados de ${snap.size} ventas en ventas_pos para ${fecha}.`)
    } catch (e: any) {
      console.error('[NuevoCuadre] Error precargando de POS:', e)
      setError(`Error al consultar POS: ${e?.message || e}`)
    } finally {
      setLoadingPos(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!fecha) { setError('Selecciona una fecha.'); return }
    setSaving(true)
    const gastosClean: CuadreGasto[] = gastos
      .filter(g => num(g.monto) > 0)
      .map(g => ({
        monto: num(g.monto),
        observacion: g.observacion.trim(),
        tipo: g.tipo,
        categoria: g.tipo === 'Gasto de mercadería' ? 'Inventario / Mercadería' : 'Otros',
      }))

    const created = await createCuadreERP({
      sede,
      fecha,
      estado: 'enviado',
      montos: {
        efectivoSistema: num(efectivoSistema),
        efectivoReal: num(efectivoReal),
        debitoSistema: num(debitoSistema),
        debitoReal: num(debitoReal),
        transferencias: num(transferencias),
      },
      calculos: {
        gastosTotales: calc.gastosTotales,
        gastosMercaderia: calc.gastosMercaderia,
        gastosQueAfectanGanancia: calc.gastosQueAfectanGanancia,
        totalNeto: calc.totalNeto,
        totalBruto: calc.totalBruto,
        diferenciaTotal: calc.diferenciaTotal,
        diferenciaEfectivo: calc.diferenciaEfectivo,
        diferenciaDebito: calc.diferenciaDebito,
      },
      gastos: gastosClean,
      topProducts: [],
      fotos: [],
      anuladas: [],
      devoluciones: [],
    })
    setSaving(false)
    if (!created) { setError('No se pudo guardar el cuadre. Intenta nuevamente.'); return }
    router.push('/cuadres')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 sm:px-6 py-5">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/cuadres')} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-800">Nuevo Cuadre de Caja</h1>
              <p className="text-xs text-slate-500 mt-0.5">Sincronizado con POS y ventas en tiempo real.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePreloadFromPOS}
            disabled={loadingPos}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 px-3.5 py-2 text-xs font-bold hover:bg-sky-100 disabled:opacity-50 transition shadow-sm"
          >
            {loadingPos ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="text-sky-600" />}
            {loadingPos ? 'Consultando POS…' : 'Cargar datos del POS'}
          </button>
        </div>

        {posSuccessMsg && (
          <div className="mb-4 rounded-xl bg-sky-50/80 border border-sky-200 px-4 py-2.5 text-xs text-sky-800 font-medium">
            ⚡ {posSuccessMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Sede + fecha */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Sede">
              <select value={sede} onChange={e => setSede(e.target.value as SedeSlug)} className={inputCls}>
                {SEDE_KEYS.map(s => <option key={s} value={s}>{SEDES[s] || s}</option>)}
              </select>
            </Field>
            <Field label="Fecha">
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
            </Field>
          </div>

          {/* Montos */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800">Medios de pago</h2>
              <span className="text-[11px] text-slate-400">Rellena el conteo real físico</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MoneyField icon={<Wallet size={14} className="text-emerald-500" />} label="Efectivo Sistema (POS)" value={efectivoSistema} onChange={setEfectivoSistema} />
              <MoneyField icon={<Wallet size={14} className="text-emerald-500" />} label="Efectivo Real (conteo físico)" value={efectivoReal} onChange={setEfectivoReal} />
              <MoneyField icon={<CreditCard size={14} className="text-sky-500" />} label="Débito Sistema (Transbank)" value={debitoSistema} onChange={setDebitoSistema} />
              <MoneyField icon={<CreditCard size={14} className="text-sky-500" />} label="Débito Real (vouchers POS)" value={debitoReal} onChange={setDebitoReal} />
              <MoneyField icon={<ArrowLeftRight size={14} className="text-violet-500" />} label="Transferencias" value={transferencias} onChange={setTransferencias} />
            </div>
          </div>

          {/* Gastos y compras anotadas */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><HandCoins size={15} className="text-rose-500" /> Salidas y anotaciones del día</h2>
              <button type="button" onClick={addGasto} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 text-rose-700 px-3 py-1.5 text-xs font-bold hover:bg-rose-100 transition">
                <Plus size={14} /> Agregar registro
              </button>
            </div>
            {gastos.length === 0 ? (
              <p className="text-xs text-slate-400">Registra aquí los egresos de caja y clasifica las compras de mercadería como anotaciones aparte.</p>
            ) : (
              <div className="space-y-2">
                {gastos.map((g, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[8rem,13rem,1fr,auto] gap-2">
                    <input type="number" min={0} value={g.monto} onChange={e => updGasto(i, 'monto', e.target.value)} placeholder="Monto" className={inputCls} />
                    <select value={g.tipo} onChange={e => updGasto(i, 'tipo', e.target.value as GastoDraft['tipo'])} className={inputCls}>
                      <option value="Operacional">Gasto operacional</option>
                      <option value="Gasto de mercadería">Compra de mercadería · anotación</option>
                    </select>
                    <input value={g.observacion} onChange={e => updGasto(i, 'observacion', e.target.value)} placeholder="Descripción" className={inputCls} />
                    <button type="button" onClick={() => delGasto(i)} className="justify-self-end p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen calculado */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-1.5"><Scale size={15} /> Resumen (automático)</h2>
            <p className="text-xs text-emerald-700 mb-3">La caja neta descuenta todas las salidas registradas. La mercadería queda anotada aparte y no se considera gasto para calcular la ganancia.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Summary label="Venta Bruta" value={fmtCLP(calc.totalBruto)} accent="text-emerald-800 font-black" />
              <Summary label="Gastos operacionales" value={fmtCLP(calc.gastosQueAfectanGanancia)} accent="text-rose-700 font-bold" />
              <Summary label="Mercadería anotada aparte" value={fmtCLP(calc.gastosMercaderia)} accent="text-cyan-700 font-bold" />
              <Summary label="Total salidas de caja" value={fmtCLP(calc.gastosTotales)} accent="text-slate-700 font-bold" />
              <Summary label="Caja neta" value={fmtCLP(calc.totalNeto)} accent="text-emerald-800 font-black" />
              <Summary label="Dif. Efectivo" value={fmtCLP(calc.diferenciaEfectivo)} accent={calc.diferenciaEfectivo === 0 ? 'text-slate-700' : 'text-red-700 font-bold'} />
              <Summary label="Dif. Débito" value={fmtCLP(calc.diferenciaDebito)} accent={calc.diferenciaDebito === 0 ? 'text-slate-700' : 'text-red-700 font-bold'} />
              <Summary label="Dif. Total" value={fmtCLP(calc.diferenciaTotal)} accent={calc.diferenciaTotal === 0 ? 'text-slate-700' : 'text-red-700 font-bold'} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-2.5 text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 transition shadow-sm">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Guardando…' : 'Guardar cuadre'}
            </button>
            <button type="button" onClick={() => router.push('/cuadres')} className="rounded-xl border border-slate-200 text-slate-600 px-5 py-2.5 text-sm font-semibold hover:bg-slate-50 transition">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = 'border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

function MoneyField({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">{icon} {label}</span>
      <input type="number" min={0} value={value} onChange={e => onChange(e.target.value)} placeholder="0" className={`${inputCls} w-full`} />
    </label>
  )
}

function Summary({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-white/70 border border-emerald-100 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm ${accent}`}>{value}</p>
    </div>
  )
}
