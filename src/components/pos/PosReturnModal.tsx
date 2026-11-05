'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, RotateCcw, Loader2, Printer, CheckCircle2 } from 'lucide-react'
import { auth } from '@/lib/firebase'

type SaleLine = { sku?: string; nombre?: string; cantidad?: number; subtotal?: number; precioUnitario?: number }
type ReturnLine = { lineIndex: number; quantity: number; restock: boolean }

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n))
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

function printInternalReceipt(record: any, sale: any) {
  const popup = window.open('', '_blank', 'width=420,height=700')
  if (!popup) return
  const lines = Array.isArray(record.items) ? record.items : []
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante de devolución</title><style>
    body{font:14px Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}p{margin:5px 0}.muted{color:#555}.line{display:flex;justify-content:space-between;border-bottom:1px dashed #bbb;padding:8px 0}.total{font-size:18px;font-weight:bold;margin-top:12px}.notice{border:1px solid #d97706;background:#fffbeb;padding:10px;margin-top:18px;font-size:12px}
  </style></head><body><h1>Comprobante interno de devolución</h1><p class="muted">${escapeHtml(record.sede)}</p><p>Boleta original: #${escapeHtml(record.boletaNumero || sale?.id || '')}</p><p>Cliente: ${escapeHtml(record.clienteNombre || 'Cliente')}</p><p>Fecha: ${escapeHtml(new Date(record.createdAtTs || Date.now()).toLocaleString('es-CL'))}</p><hr>${lines.map((line: any) => `<div class="line"><span>${escapeHtml(line.quantity)} × ${escapeHtml(line.nombre || line.sku)}</span><strong>${fmtCLP(Number(line.amount || 0))}</strong></div>`).join('')}<p class="total">Reembolso: ${fmtCLP(Number(record.total || 0))}</p><p>Medio: ${escapeHtml(record.paymentMethod)}</p><p>Motivo: ${escapeHtml(record.reason)}</p><div class="notice"><strong>Documento interno.</strong> No es una nota de crédito tributaria ni reemplaza el documento fiscal emitido por el SII.</div><script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}

export default function PosReturnModal({
  sale,
  sede,
  refundSessionId,
  cashierName,
  onClose,
  onSuccess,
}: {
  sale: any | null
  sede: string
  refundSessionId?: string
  cashierName?: string
  onClose: () => void
  onSuccess?: (record: any) => void
}) {
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [restock, setRestock] = useState<Record<number, boolean>>({})
  const [reason, setReason] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [saving, setSaving] = useState(false)
  const [returnId] = useState(() => `ret_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`)
  const [loadingPrevious, setLoadingPrevious] = useState(false)
  const [returnedByLine, setReturnedByLine] = useState<Record<number, number>>({})
  const [savedRecord, setSavedRecord] = useState<any | null>(null)
  const [error, setError] = useState('')

  const lines: SaleLine[] = Array.isArray(sale?.items) ? sale.items : (() => { try { return JSON.parse(String(sale?.itemsJson || '[]')) } catch { return [] } })()
  const payments = useMemo(() => {
    const raw = Array.isArray(sale?.pagos) && sale.pagos.length
      ? sale.pagos
      : [{ metodo: sale?.metodoPago || 'efectivo', monto: sale?.total || 0 }]
    return raw.filter((p: any) => ['efectivo', 'debito', 'transferencia'].includes(String(p.metodo || '').toLowerCase()))
  }, [sale])
  const refundMethods = payments

  useEffect(() => {
    let active = true
    const loadPrevious = async () => {
      if (!sale) return
      setLoadingPrevious(true)
      setReturnedByLine({})
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Sesión Firebase no disponible')
        const response = await fetch(`/api/pos/returns?saleId=${encodeURIComponent(sale.id || sale.$id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo consultar el historial de devoluciones')
        if (active) setReturnedByLine(payload.returnedByLine || {})
      } catch (err: any) {
        if (active) setError(err?.message || 'No se pudo consultar el historial de devoluciones')
      } finally {
        if (active) setLoadingPrevious(false)
      }
    }
    loadPrevious()
    return () => { active = false }
  }, [sale?.id, sale?.$id])

  const selectedLines: ReturnLine[] = lines.map((line, lineIndex) => ({
    lineIndex,
    quantity: Math.min(Math.max(0, Math.trunc(Number(quantities[lineIndex] || 0))), Math.max(0, Math.trunc(Number(line.cantidad || 0)))),
    restock: restock[lineIndex] !== false,
  })).filter(line => line.quantity > 0)
  const selectedTotal = selectedLines.reduce((sum, selected) => {
    const line = lines[selected.lineIndex]
    const lineSubtotal = Math.max(0, Number(line?.subtotal || 0))
    const baseSubtotal = lines.reduce((total, item) => total + Math.max(0, Number(item.subtotal || 0)), 0)
    const discount = Math.min(baseSubtotal, Math.max(0, Number(sale?.descuentoGlobal || 0)))
    const netLine = baseSubtotal > 0 ? lineSubtotal - discount * (lineSubtotal / baseSubtotal) : lineSubtotal
    return sum + Math.round(netLine * selected.quantity / Math.max(1, Number(line?.cantidad || 0)))
  }, 0)

  if (!sale) return null

  const submit = async () => {
    if (!selectedLines.length) return setError('Selecciona al menos un producto y una cantidad.')
    if (!reason.trim()) return setError('Indica el motivo de la devolución.')
    if (!paymentMethod) return setError('Selecciona el medio por el que se hará el reembolso.')
    if (!refundSessionId) return setError('Abre una caja en esta sucursal para que la devolución quede registrada en el corte.')
    setSaving(true); setError('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('La sesión no está autenticada en Firebase. Vuelve a iniciar sesión.')
      const response = await fetch('/api/pos/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
        body: JSON.stringify({
          returnId, saleId: sale.id || sale.$id, sede, refundSessionId: refundSessionId || '',
          items: selectedLines,
          reason: reason.trim(), paymentMethod,
          createdByName: cashierName || auth.currentUser?.displayName || auth.currentUser?.email || 'Usuario POS',
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo registrar la devolución.')
      setSavedRecord(payload.data)
      onSuccess?.(payload.data)
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar la devolución.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3 sm:p-5" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700"><RotateCcw size={19} /></span><div><h2 className="font-bold text-slate-900">Registrar devolución</h2><p className="text-xs text-slate-500">Boleta #{sale.boletaNumero || (sale.id || sale.$id || '').slice(-7)}</p></div></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {savedRecord ? (
          <div className="space-y-4 overflow-y-auto p-6 text-center">
            <CheckCircle2 size={42} className="mx-auto text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">Devolución registrada</h3>
            <p className="text-sm text-slate-600">Monto: <strong>{fmtCLP(savedRecord.total)}</strong> · Reembolso: <strong className="capitalize">{savedRecord.paymentMethod}</strong></p>
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Este es un comprobante interno. No es una nota de crédito tributaria del SII.</p>
            <div className="flex justify-center gap-2"><button onClick={() => printInternalReceipt(savedRecord, sale)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Printer size={16} /> Imprimir comprobante</button><button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cerrar</button></div>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
            <p className="text-xs text-slate-500">Elige cantidades. El producto solo vuelve al stock si marcas que está apto para venderse.{loadingPrevious ? ' Consultando devoluciones anteriores…' : ''}</p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {lines.map((line, index) => {
                const qty = Math.max(0, Math.trunc(Number(quantities[index] || 0)))
                const already = Math.max(0, Math.trunc(Number(returnedByLine[index] || 0)))
                const available = Math.max(0, Math.trunc(Number(line.cantidad || 0)) - already)
                return <div key={`${line.sku || index}-${index}`} className="grid grid-cols-[1fr_82px] items-center gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_95px_160px]">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{line.nombre || line.sku}</p><p className="text-xs text-slate-500">SKU {line.sku || '—'} · Vendido: {line.cantidad} · Disponible: {available}</p></div>
                  <input aria-label={`Cantidad a devolver de ${line.nombre || line.sku}`} type="number" min="0" max={available} step="1" value={qty || ''} disabled={available <= 0} onChange={event => setQuantities(prev => ({ ...prev, [index]: Math.min(available, Math.max(0, Math.trunc(Number(event.target.value) || 0))) }))} placeholder="0" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-center text-sm" />
                  <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600 sm:col-span-1"><input type="checkbox" checked={restock[index] !== false} onChange={event => setRestock(prev => ({ ...prev, [index]: event.target.checked }))} /> Reingresar unidades aptas al stock</label>
                </div>
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Reembolsar por<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800"><option value="">Seleccionar medio</option>{Array.from(new Set<string>(refundMethods.map((p: any) => String(p.metodo).toLowerCase()))).map(method => <option key={method} value={method}>{method[0].toUpperCase() + method.slice(1)}</option>)}</select></label>
              <div className="flex flex-col justify-center rounded-xl bg-slate-50 px-4 py-2"><span className="text-xs text-slate-500">Monto estimado del reembolso</span><strong className="text-xl text-slate-900">{fmtCLP(selectedTotal)}</strong></div>
            </div>
            <label className="block text-xs font-semibold text-slate-600">Motivo<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={2} placeholder="Producto defectuoso, cambio autorizado, etc." className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {!refundSessionId && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Abre una caja en esta sucursal antes de devolver. Así queda anotado en el corte.</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button onClick={onClose} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button onClick={submit} disabled={saving || loadingPrevious || selectedTotal <= 0 || !refundSessionId} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}{saving ? 'Registrando…' : 'Confirmar devolución'}</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
