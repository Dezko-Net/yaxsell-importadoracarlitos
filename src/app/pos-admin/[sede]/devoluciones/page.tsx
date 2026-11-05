'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { auth, authReady } from '@/lib/firebase'
import { DEFAULT_SEDE, SEDES, type SedeSlug } from '@/types'
import {
  RefreshCw,
  RotateCcw,
  ReceiptText,
  Calendar,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  User,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Edit3,
  ArrowUpRight,
  Eye,
  Download,
  Printer,
  Clock3,
} from 'lucide-react'
import styles from './devoluciones.module.css'

type OperationKind = 'devolucion' | 'anulacion' | 'edicion'

interface ReturnItemRecord {
  sku?: string
  nombre?: string
  quantity?: number
  amount?: number
  restock?: boolean
}

interface UnifiedAuditRecord {
  returnId?: string
  id: string
  saleId?: string
  sede?: string
  tipo: OperationKind
  tipoLabel?: string
  boletaNumero?: number | string
  clienteNombre?: string
  cajeroNombre?: string
  createdByName?: string
  createdBy?: string
  total?: number
  paymentMethod?: string
  reason?: string
  items?: ReturnItemRecord[]
  createdAtTs?: number
  saleFechaStr?: string
  estado?: string
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
    Math.round(n || 0)
  )

const fmtCount = (n: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n || 0))

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!
  )

const toSantiagoYmd = (date: Date): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(date)
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
}

const getRecordDate = (record: UnifiedAuditRecord): string => {
  const ts = Number(record.createdAtTs || 0)
  if (ts > 0) return toSantiagoYmd(new Date(ts))
  if (record.saleFechaStr) return String(record.saleFechaStr).slice(0, 10)
  return ''
}

const formatShortDateTime = (ts?: number, fallbackDate?: string) => {
  const num = Number(ts || 0)
  if (num > 0) {
    try {
      const d = new Date(num)
      const datePart = new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Santiago',
      })
        .format(d)
        .replace('.', '')
      const timePart = new Intl.DateTimeFormat('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Santiago',
      }).format(d)
      return { datePart, timePart, full: `${datePart} · ${timePart}` }
    } catch {}
  }
  return {
    datePart: fallbackDate || 'Sin fecha',
    timePart: '',
    full: fallbackDate || 'Sin fecha',
  }
}

const formatRangeLabel = (desde: string, hasta: string, todayStr: string, yesterdayStr: string) => {
  if (!desde && !hasta) return 'Histórico completo'
  if (desde === todayStr && hasta === todayStr) return 'Hoy'
  if (desde === yesterdayStr && hasta === yesterdayStr) return 'Ayer'
  const fmtOne = (ymd: string) => {
    if (!ymd) return '…'
    const [y, m, d] = ymd.split('-').map(Number)
    if (!y || !m || !d) return ymd
    return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' })
      .format(new Date(y, m - 1, d, 12))
      .replace('.', '')
  }
  if (desde === hasta) return fmtOne(desde)
  return `${fmtOne(desde)} – ${fmtOne(hasta)}`
}

function printReturn(record: UnifiedAuditRecord) {
  const popup = window.open('', '_blank', 'width=420,height=720')
  if (!popup) return
  const kindTitle =
    record.tipo === 'anulacion'
      ? 'Anulación de boleta'
      : record.tipo === 'edicion'
        ? 'Edición de venta'
        : 'Devolución POS'
  const folio = record.boletaNumero ? `#${record.boletaNumero}` : `#${String(record.saleId || record.id).slice(-6).toUpperCase()}`
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante interno ${escapeHtml(folio)}</title><style>body{font:13px/1.45 'Segoe UI',Arial,sans-serif;color:#16231f;margin:22px}h1{font-size:18px;margin:0 0 4px}.muted{color:#5d706a;font-size:12px;margin:0 0 12px}.meta{border-top:1px solid #dce5e0;border-bottom:1px solid #dce5e0;padding:8px 0;margin-bottom:12px;font-size:12px}.meta div{display:flex;justify-content:space-between;padding:2px 0}.line{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed #cfd9d3;padding:6px 0;font-size:12px}.total{display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding:10px 0 4px}.reason{background:#f4f6f3;border:1px solid #dce5e0;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:12px}.notice{border:1px solid #d4e3d8;background:#edf5ef;color:#2c4a3c;border-radius:8px;padding:9px 10px;margin-top:14px;font-size:11px}</style></head><body><h1>${escapeHtml(kindTitle)}</h1><p class="muted">Sucursal: ${escapeHtml(record.sede || '')}</p><div class="meta"><div><span>Boleta referencia</span><strong>${escapeHtml(folio)}</strong></div><div><span>Cliente</span><strong>${escapeHtml(record.clienteNombre || 'Cliente')}</strong></div><div><span>Registrado por</span><strong>${escapeHtml(record.createdByName || record.cajeroNombre || 'Operador')}</strong></div><div><span>Medio registrado</span><strong style="text-transform:capitalize">${escapeHtml(record.paymentMethod || 'Efectivo')}</strong></div><div><span>Fecha operación</span><strong>${escapeHtml(new Date(Number(record.createdAtTs || Date.now())).toLocaleString('es-CL'))}</strong></div></div>${(record.items || []).map(item => `<div class="line"><span>${escapeHtml(item.quantity)} × ${escapeHtml(item.nombre || item.sku)}</span><strong>${fmtCLP(Number(item.amount || 0))}</strong></div>`).join('')}<div class="total"><span>Monto involucrado</span><strong>${fmtCLP(Number(record.total || 0))}</strong></div><div class="reason"><strong>Motivo registrado:</strong><br>${escapeHtml(record.reason || 'Sin motivo especificado')}</div><div class="notice"><strong>Documento interno Asistora POS:</strong> respaldo de auditoría y control de sucursal.</div><script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}

const paymentMethodKey = (raw?: string): 'efectivo' | 'debito' | 'transferencia' | 'otros' => {
  const m = String(raw || '').toLowerCase().trim()
  if (m === 'efectivo') return 'efectivo'
  if (m === 'debito' || m === 'débito' || m === 'tarjeta') return 'debito'
  if (m === 'transferencia') return 'transferencia'
  return 'otros'
}

const paymentLabels: Record<'efectivo' | 'debito' | 'transferencia' | 'otros', string> = {
  efectivo: 'Efectivo',
  debito: 'Débito / Tarjeta',
  transferencia: 'Transferencia',
  otros: 'Otros medios',
}

export default function PosReturnsHistoryPage() {
  const params = useParams<{ sede: string }>()
  const sede = String(params?.sede || DEFAULT_SEDE) as SedeSlug
  const branchName = SEDES[sede] || sede.replace(/-/g, ' ')

  const [records, setRecords] = useState<UnifiedAuditRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<UnifiedAuditRecord | null>(null)

  // ─── Date presets in America/Santiago ────────────────────────────────────────
  const { todayStr, yesterdayStr, sevenDaysAgoStr, firstOfMonthStr } = useMemo(() => {
    const today = toSantiagoYmd(new Date())
    const [y, m, d] = today.split('-').map(Number)
    const base = new Date(y, m - 1, d, 12)

    const yest = new Date(base)
    yest.setDate(base.getDate() - 1)

    const week = new Date(base)
    week.setDate(base.getDate() - 6)

    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    return {
      todayStr: today,
      yesterdayStr: toSantiagoYmd(yest),
      sevenDaysAgoStr: toSantiagoYmd(week),
      firstOfMonthStr: monthStart,
    }
  }, [])

  // Filters & pagination state
  const [fechaDesde, setFechaDesde] = useState<string>(firstOfMonthStr)
  const [fechaHasta, setFechaHasta] = useState<string>(todayStr)
  const [filterTipo, setFilterTipo] = useState<'todos' | OperationKind>('todos')
  const [filterMetodo, setFilterMetodo] = useState<string>('todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState<'recent' | 'amount-desc'>('recent')
  const [page, setPage] = useState(1)
  const pageSize = 15

  const loadRecords = useCallback(
    async (desde = fechaDesde, hasta = fechaHasta) => {
      setLoading(true)
      setError('')
      try {
        await authReady
        let user = auth.currentUser
        if (!user) {
          user = await new Promise(resolve => {
            const unsub = auth.onAuthStateChanged(u => {
              unsub()
              resolve(u)
            })
            setTimeout(() => {
              unsub()
              resolve(auth.currentUser)
            }, 1500)
          })
        }
        const token = await user?.getIdToken()
        if (!token) throw new Error('Inicia sesión para consultar las operaciones de esta sucursal.')

        const url = new URL('/api/pos/returns', window.location.origin)
        url.searchParams.set('sede', sede)
        if (desde) url.searchParams.set('startDate', desde)
        if (hasta) url.searchParams.set('endDate', hasta)

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'No se pudieron cargar las operaciones.')
        }
        setRecords(Array.isArray(payload.records) ? payload.records : [])
      } catch (err: any) {
        setError(err?.message || 'No se pudieron cargar las operaciones.')
      } finally {
        setLoading(false)
      }
    },
    [sede, fechaDesde, fechaHasta]
  )

  useEffect(() => {
    void loadRecords(fechaDesde, fechaHasta)
  }, [sede])

  // Close modal on Escape
  useEffect(() => {
    if (!selectedRecord) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSelectedRecord(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedRecord])

  const applyDateRange = (desde: string, hasta: string) => {
    const normalizedHasta = desde && hasta && desde > hasta ? desde : hasta
    setFechaDesde(desde)
    setFechaHasta(normalizedHasta)
    setPage(1)
    void loadRecords(desde, normalizedHasta)
  }

  const recordMatchesDateRange = useCallback(
    (record: UnifiedAuditRecord) => {
      if (!fechaDesde && !fechaHasta) return true
      const opDate = getRecordDate(record)
      const saleDate = record.saleFechaStr ? String(record.saleFechaStr).slice(0, 10) : ''
      if (!opDate && !saleDate) return true

      const inBounds = (d: string) => {
        if (!d) return false
        if (fechaDesde && d < fechaDesde) return false
        if (fechaHasta && d > fechaHasta) return false
        return true
      }
      return inBounds(opDate) || inBounds(saleDate)
    },
    [fechaDesde, fechaHasta]
  )

  // Scoped to selected date range (for operation tab counters)
  const dateScopedRecords = useMemo(
    () => records.filter(recordMatchesDateRange),
    [records, recordMatchesDateRange]
  )

  const countsByType = useMemo(() => {
    let devolucion = 0
    let anulacion = 0
    let edicion = 0
    for (const r of dateScopedRecords) {
      if (r.tipo === 'devolucion') devolucion++
      else if (r.tipo === 'anulacion') anulacion++
      else if (r.tipo === 'edicion') edicion++
    }
    return {
      todos: dateScopedRecords.length,
      devolucion,
      anulacion,
      edicion,
    }
  }, [dateScopedRecords])

  // Filtered + sorted records
  const filteredRecords = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    const cleanNumericTerm = term.replace(/[.$#]/g, '')

    const list = dateScopedRecords.filter(record => {
      if (filterTipo !== 'todos' && record.tipo !== filterTipo) return false

      if (filterMetodo !== 'todos') {
        if (paymentMethodKey(record.paymentMethod) !== filterMetodo) return false
      }

      if (term) {
        const boleta = String(record.boletaNumero || '').toLowerCase()
        const saleId = String(record.saleId || record.id || '').toLowerCase()
        const cliente = String(record.clienteNombre || '').toLowerCase()
        const operador = String(record.createdByName || record.cajeroNombre || record.createdBy || '').toLowerCase()
        const reason = String(record.reason || '').toLowerCase()
        const amountStr = String(Math.round(Number(record.total || 0)))
        const itemsMatch = (record.items || []).some(
          it =>
            String(it.nombre || '').toLowerCase().includes(term) ||
            String(it.sku || '').toLowerCase().includes(term)
        )

        const matches =
          boleta.includes(term) ||
          (cleanNumericTerm.length > 0 && boleta.includes(cleanNumericTerm)) ||
          saleId.includes(term) ||
          cliente.includes(term) ||
          operador.includes(term) ||
          reason.includes(term) ||
          (cleanNumericTerm.length >= 3 && amountStr.includes(cleanNumericTerm)) ||
          itemsMatch

        if (!matches) return false
      }

      return true
    })

    if (sortOrder === 'amount-desc') {
      return [...list].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    }
    return [...list].sort((a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0))
  }, [dateScopedRecords, filterTipo, filterMetodo, searchTerm, sortOrder])

  // KPI & Payment Method Breakdown
  const summary = useMemo(() => {
    const byMethod: Record<'efectivo' | 'debito' | 'transferencia' | 'otros', number> = {
      efectivo: 0,
      debito: 0,
      transferencia: 0,
      otros: 0,
    }
    let totalAmount = 0
    let totalUnits = 0

    for (const r of filteredRecords) {
      const amt = Number(r.total || 0)
      totalAmount += amt
      byMethod[paymentMethodKey(r.paymentMethod)] += amt
      for (const it of r.items || []) {
        totalUnits += Number(it.quantity || 0)
      }
    }

    return {
      totalAmount,
      totalUnits,
      byMethod,
    }
  }, [filteredRecords])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [filteredRecords, safePage, pageSize])

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      filterTipo !== 'todos' ||
      filterMetodo !== 'todos' ||
      fechaDesde !== firstOfMonthStr ||
      fechaHasta !== todayStr
  )

  const clearAllFilters = () => {
    setSearchTerm('')
    setFilterTipo('todos')
    setFilterMetodo('todos')
    setSortOrder('recent')
    applyDateRange(firstOfMonthStr, todayStr)
  }

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return
    const headers = ['Tipo', 'Boleta', 'Fecha Operacion', 'Fecha Venta', 'Operador', 'Cliente', 'Medio Pago', 'Monto CLP', 'Unidades', 'Motivo', 'Detalle Articulos']
    const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = filteredRecords.map(r => {
      const folio = r.boletaNumero ? `#${r.boletaNumero}` : `#${String(r.saleId || r.id).slice(-6).toUpperCase()}`
      const dt = r.createdAtTs ? new Date(Number(r.createdAtTs)).toLocaleString('es-CL') : ''
      const units = (r.items || []).reduce((acc, it) => acc + Number(it.quantity || 0), 0)
      const itemsText = (r.items || []).map(it => `${it.quantity}x ${it.nombre || it.sku}`).join(' | ')
      return [
        r.tipoLabel || r.tipo,
        folio,
        dt,
        r.saleFechaStr || '',
        r.createdByName || r.cajeroNombre || 'Operador',
        r.clienteNombre || 'Cliente',
        r.paymentMethod || 'efectivo',
        Math.round(Number(r.total || 0)),
        units,
        r.reason || '',
        itemsText,
      ]
        .map(csvEscape)
        .join(';')
    })
    const csv = '\uFEFF' + [headers.map(csvEscape).join(';'), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria_pos_${sede}_${fechaDesde || 'inicio'}_${fechaHasta || 'hoy'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getSaleHref = (record: UnifiedAuditRecord) => {
    const queryRef = record.boletaNumero ? String(record.boletaNumero) : String(record.saleId || record.id).slice(-6)
    const saleDay = record.saleFechaStr ? String(record.saleFechaStr).slice(0, 10) : getRecordDate(record)
    const qs = new URLSearchParams()
    if (queryRef) qs.set('search', queryRef)
    if (saleDay) qs.set('fecha', saleDay)
    return `/pos-admin/${sede}/ventas?${qs.toString()}`
  }

  const renderMethodIcon = (method?: string) => {
    const key = paymentMethodKey(method)
    if (key === 'efectivo') return <Banknote size={13} />
    if (key === 'debito') return <CreditCard size={13} />
    return <ArrowRightLeft size={13} />
  }

  const renderStatusBadge = (tipo: OperationKind) => {
    if (tipo === 'anulacion') {
      return (
        <span className={styles.statusBadge} data-kind="anulacion">
          <XCircle size={13} />
          Anulación
        </span>
      )
    }
    if (tipo === 'edicion') {
      return (
        <span className={styles.statusBadge} data-kind="edicion">
          <Edit3 size={13} />
          Edición
        </span>
      )
    }
    return (
      <span className={styles.statusBadge} data-kind="devolucion">
        <RotateCcw size={13} />
        Devolución
      </span>
    )
  }

  const paymentEntries = (['efectivo', 'debito', 'transferencia', 'otros'] as const).filter(
    key => key !== 'otros' || summary.byMethod.otros > 0
  )

  return (
    <div className={styles.page}>
      {/* ─── Header (Asistora POS Admin Inicio style) ─── */}
      <header className={styles.heading}>
        <div className={styles.headingInfo}>
          <div className={styles.eyebrow}>
            <span className={styles.brandAccent} aria-hidden="true" title="Asistora">
              <i style={{ backgroundColor: '#e83462' }} />
              <i style={{ backgroundColor: '#f3c437' }} />
              <i style={{ backgroundColor: '#08a88f' }} />
            </span>
            <span className={styles.eyebrowBranch}>{branchName}</span>
            <span className={styles.eyebrowSep}>/</span>
            <span>Control y auditoría</span>
            <span className={styles.syncBadge} data-ready={!loading && !error}>
              <i />
              {loading ? 'Consultando registros…' : error ? 'Atención requerida' : 'Sincronizado'}
            </span>
          </div>
          <h1>Devoluciones y Anulaciones</h1>
          <p className={styles.headingSubtitle}>
            Trazabilidad unificada de reintegros, boletas anuladas y operaciones registradas en caja.
          </p>
        </div>

        <div className={styles.headingActions}>
          <Link href={`/pos-admin/${sede}/modificaciones`} className={styles.actionSecondary}>
            <Edit3 size={16} />
            <span>Ediciones y Precios</span>
          </Link>
          <Link href={`/pos-admin/${sede}/ventas`} className={styles.actionSecondary}>
            <ReceiptText size={16} />
            <span>Ver ventas</span>
          </Link>
          <button
            type="button"
            onClick={() => void loadRecords(fechaDesde, fechaHasta)}
            disabled={loading}
            className={styles.actionPrimary}
          >
            <RefreshCw size={15} className={loading ? styles.spin : ''} />
            <span>{loading ? 'Cargando…' : 'Actualizar'}</span>
          </button>
        </div>
      </header>

      {/* ─── Error Banner ─── */}
      {error && (
        <div role="alert" className={styles.errorAlert}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadRecords(fechaDesde, fechaHasta)}
            className={styles.actionSecondary}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ─── Editorial Overview (Hero Card + Payment Breakdown) ─── */}
      <div className={styles.overview}>
        <section className={styles.heroCard} aria-labelledby="audit-hero-title" aria-busy={loading}>
          <div className={styles.sectionTop}>
            <div className={styles.heroTitleGroup}>
              <h2 id="audit-hero-title">Resumen de auditoría</h2>
            </div>
            <span className={styles.periodBadge}>
              <Calendar size={13} />
              {formatRangeLabel(fechaDesde, fechaHasta, todayStr, yesterdayStr)}
            </span>
          </div>

          <div className={styles.heroAmount}>
            <div>
              <p>Monto total involucrado</p>
              <strong>{loading ? '…' : fmtCLP(summary.totalAmount)}</strong>
              <span className={styles.heroAmountSub}>
                {loading
                  ? 'Calculando operaciones del período…'
                  : `${fmtCount(filteredRecords.length)} ${filteredRecords.length === 1 ? 'operación filtrada' : 'operaciones filtradas'} · ${fmtCLP(summary.byMethod.efectivo)} en efectivo`}
              </span>
            </div>
            <span className={styles.heroIcon} aria-hidden="true">
              <RotateCcw size={30} strokeWidth={1.5} />
            </span>
          </div>

          <dl className={styles.heroMetrics}>
            <div>
              <dt>
                <span className={styles.typeDot} data-kind="anulacion" />
                Boletas anuladas
              </dt>
              <dd>{loading ? '…' : fmtCount(countsByType.anulacion)}</dd>
            </div>
            <div>
              <dt>
                <span className={styles.typeDot} data-kind="devolucion" />
                Devoluciones
              </dt>
              <dd>{loading ? '…' : fmtCount(countsByType.devolucion)}</dd>
            </div>
            <div>
              <dt>
                <span className={styles.typeDot} data-kind="edicion" />
                Ventas editadas
              </dt>
              <dd>{loading ? '…' : fmtCount(countsByType.edicion)}</dd>
            </div>
          </dl>

          <div className={styles.heroFoot}>
            <CheckCircle2 size={14} />
            <span>
              Respaldo de inventario activo · {loading ? '…' : fmtCount(summary.totalUnits)} unidades involucradas en la vista actual.
            </span>
          </div>
        </section>

        <section className={styles.breakdownCard} aria-labelledby="audit-methods-title">
          <div>
            <div className={styles.sectionTop}>
              <div>
                <h2 id="audit-methods-title">Impacto por medio de pago</h2>
                <p>Según las operaciones mostradas en pantalla</p>
              </div>
              <CreditCard size={19} className={styles.breakdownIcon} />
            </div>

            <div className={styles.paymentBar} aria-hidden="true">
              {!loading &&
                paymentEntries.map(method => (
                  <span
                    key={method}
                    data-method={method}
                    style={{
                      width: `${summary.totalAmount > 0 ? (summary.byMethod[method] / summary.totalAmount) * 100 : 0}%`,
                    }}
                  />
                ))}
            </div>

            <dl className={styles.paymentRows}>
              {paymentEntries.map(method => (
                <div key={method}>
                  <dt>
                    <i data-method={method} />
                    {paymentLabels[method]}
                  </dt>
                  <dd>{loading ? '…' : fmtCLP(summary.byMethod[method])}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.breakdownFoot}>
            <span>Cada registro conserva enlace a su boleta original.</span>
            <Link href={`/pos-admin/${sede}/cortes`}>
              Ver cierres <ArrowUpRight size={13} />
            </Link>
          </div>
        </section>
      </div>

      {/* ─── Unified Filter Bar (Responsive Desktop + Mobile) ─── */}
      <section className={styles.filterPanel} aria-label="Filtros de auditoría">
        <div className={styles.filterRowPrimary}>
          {/* Search box */}
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar por # boleta, cliente, cajera, motivo o SKU…"
              className={styles.searchInput}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setPage(1)
                }}
                className={styles.clearIconBtn}
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Date range selector (inline on desktop, 2-col touch grid on mobile) */}
          <div className={styles.dateGrid}>
            <label className={styles.dateField}>
              <span className={styles.dateLabel}>
                <Calendar size={12} />
                Desde
              </span>
              <input
                aria-label="Fecha desde"
                type="date"
                value={fechaDesde}
                onChange={e => applyDateRange(e.target.value, fechaHasta)}
                className={styles.dateInput}
              />
            </label>
            <span className={styles.dateSep} aria-hidden="true">
              →
            </span>
            <label className={styles.dateField}>
              <span className={styles.dateLabel}>Hasta</span>
              <input
                aria-label="Fecha hasta"
                type="date"
                value={fechaHasta}
                onChange={e => applyDateRange(fechaDesde, e.target.value)}
                className={styles.dateInput}
              />
            </label>
          </div>

          {/* Quick date presets */}
          <div className={styles.presetStrip} role="group" aria-label="Rangos rápidos de fecha">
            {[
              { id: 'today', label: 'Hoy', desde: todayStr, hasta: todayStr },
              { id: 'yesterday', label: 'Ayer', desde: yesterdayStr, hasta: yesterdayStr },
              { id: 'week', label: '7 días', desde: sevenDaysAgoStr, hasta: todayStr },
              { id: 'month', label: 'Este mes', desde: firstOfMonthStr, hasta: todayStr },
              { id: 'all', label: 'Todo', desde: '', hasta: '' },
            ].map(preset => {
              const isActive = fechaDesde === preset.desde && fechaHasta === preset.hasta
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-active={isActive}
                  onClick={() => applyDateRange(preset.desde, preset.hasta)}
                  className={styles.presetBtn}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Payment method filter */}
          <select
            aria-label="Filtrar por medio de pago"
            value={filterMetodo}
            onChange={e => {
              setFilterMetodo(e.target.value)
              setPage(1)
            }}
            className={styles.selectControl}
          >
            <option value="todos">Medio: Todos</option>
            <option value="efectivo">Efectivo</option>
            <option value="debito">Débito / Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>

        {/* Row 2: Segmented Type Tabs + Export / Clear / Count */}
        <div className={styles.filterRowSecondary}>
          <div className={styles.typeTabs} role="tablist" aria-label="Tipo de operación">
            <button
              type="button"
              role="tab"
              aria-selected={filterTipo === 'todos'}
              data-active={filterTipo === 'todos'}
              onClick={() => {
                setFilterTipo('todos')
                setPage(1)
              }}
              className={styles.typeTab}
            >
              <span>Todas</span>
              <span className={styles.typeCount}>{countsByType.todos}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={filterTipo === 'anulacion'}
              data-active={filterTipo === 'anulacion'}
              onClick={() => {
                setFilterTipo('anulacion')
                setPage(1)
              }}
              className={styles.typeTab}
            >
              <span className={styles.typeDot} data-kind="anulacion" />
              <span>Anulaciones</span>
              <span className={styles.typeCount}>{countsByType.anulacion}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={filterTipo === 'devolucion'}
              data-active={filterTipo === 'devolucion'}
              onClick={() => {
                setFilterTipo('devolucion')
                setPage(1)
              }}
              className={styles.typeTab}
            >
              <span className={styles.typeDot} data-kind="devolucion" />
              <span>Devoluciones</span>
              <span className={styles.typeCount}>{countsByType.devolucion}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={filterTipo === 'edicion'}
              data-active={filterTipo === 'edicion'}
              onClick={() => {
                setFilterTipo('edicion')
                setPage(1)
              }}
              className={styles.typeTab}
            >
              <span className={styles.typeDot} data-kind="edicion" />
              <span>Ediciones</span>
              <span className={styles.typeCount}>{countsByType.edicion}</span>
            </button>
          </div>

          <div className={styles.filterMetaRight}>
            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className={styles.clearBtn}>
                <X size={13} />
                <span>Limpiar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className={styles.exportBtn}
              title="Exportar registros filtrados a Excel / CSV"
            >
              <Download size={13} />
              <span>Exportar CSV</span>
            </button>

            <span className={styles.countPill}>
              {fmtCount(filteredRecords.length)} {filteredRecords.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>
        </div>
      </section>

      {/* ─── Audit Records Panel (Desktop Table + Mobile Cards) ─── */}
      <section className={styles.recordsPanel} aria-labelledby="records-panel-title">
        <div className={styles.panelHeader}>
          <div className={styles.panelTitleWrap}>
            <h2 id="records-panel-title">Bitácora de operaciones</h2>
            <span className={styles.panelBadge}>{fmtCount(filteredRecords.length)}</span>
          </div>

          <div className={styles.panelControls}>
            <select
              aria-label="Ordenar operaciones"
              value={sortOrder}
              onChange={e => {
                setSortOrder(e.target.value as 'recent' | 'amount-desc')
                setPage(1)
              }}
              className={styles.compactSelect}
            >
              <option value="recent">Más recientes</option>
              <option value="amount-desc">Mayor importe</option>
            </select>
            <span className={styles.pageIndicator}>
              Pág. {safePage} de {totalPages}
            </span>
          </div>
        </div>

        {loading ? (
          <div className={styles.stateBox} role="status">
            <div className={styles.stateIcon}>
              <RefreshCw size={20} className={styles.spin} />
            </div>
            <h3>Consultando operaciones de {branchName}…</h3>
            <p>Unificando devoluciones, boletas anuladas y ediciones registradas en la sucursal.</p>
          </div>
        ) : paginatedRecords.length === 0 ? (
          <div className={styles.stateBox}>
            <div className={styles.stateIcon}>
              <RotateCcw size={21} />
            </div>
            <h3>Sin operaciones para mostrar</h3>
            <p>
              {hasActiveFilters
                ? 'No encontramos anulaciones, devoluciones ni ediciones que coincidan con la fecha o búsqueda seleccionada.'
                : 'No se registran operaciones en el período seleccionado para esta sucursal.'}
            </p>
            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className={styles.actionSecondary}>
                <X size={14} />
                <span>Restablecer filtros</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ─── Desktop Table (>= 981px) ─── */}
            <div className={styles.desktopTableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Comprobante / Fecha</th>
                    <th>Tipo</th>
                    <th>Operador / Cliente</th>
                    <th>Artículos involucrados</th>
                    <th>Motivo registrado</th>
                    <th>Medio</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map(record => {
                    const key = record.returnId || `${record.tipo}_${record.id}`
                    const folio = record.boletaNumero
                      ? `Boleta #${record.boletaNumero}`
                      : `Ticket #${String(record.saleId || record.id).slice(-6).toUpperCase()}`
                    const dt = formatShortDateTime(record.createdAtTs, record.saleFechaStr)
                    const items = Array.isArray(record.items) ? record.items : []
                    const firstItem = items[0]
                    const extraItemsCount = Math.max(0, items.length - 1)
                    const anyRestock = items.some(it => it.restock) || record.tipo === 'anulacion'
                    const mKey = paymentMethodKey(record.paymentMethod)

                    return (
                      <tr key={key}>
                        <td>
                          <div className={styles.ticketCell}>
                            <span className={styles.ticketIcon} data-kind={record.tipo}>
                              {record.tipo === 'anulacion' ? (
                                <XCircle size={16} />
                              ) : record.tipo === 'edicion' ? (
                                <Edit3 size={16} />
                              ) : (
                                <RotateCcw size={16} />
                              )}
                            </span>
                            <div>
                              <button
                                type="button"
                                onClick={() => setSelectedRecord(record)}
                                className={styles.boletaBtn}
                              >
                                {folio}
                              </button>
                              <span className={styles.subMeta}>{dt.full}</span>
                            </div>
                          </div>
                        </td>

                        <td>{renderStatusBadge(record.tipo)}</td>

                        <td>
                          <div className={styles.operatorCell}>
                            <strong>{record.createdByName || record.cajeroNombre || 'Operador'}</strong>
                            <span>{record.clienteNombre || 'Cliente general'}</span>
                          </div>
                        </td>

                        <td>
                          <div className={styles.itemsSummary}>
                            {firstItem ? (
                              <>
                                <div className={styles.itemPrimaryLine}>
                                  <span className={styles.itemQty}>{firstItem.quantity} ×</span>
                                  <span className={styles.itemName} title={firstItem.nombre || firstItem.sku}>
                                    {firstItem.nombre || firstItem.sku}
                                  </span>
                                </div>
                                <div className={styles.itemsSubRow}>
                                  {firstItem.sku && <span className={styles.skuTag}>{firstItem.sku}</span>}
                                  {extraItemsCount > 0 && (
                                    <span className={styles.moreTag}>+{extraItemsCount} más</span>
                                  )}
                                  {anyRestock && (
                                    <span className={styles.restockTag}>
                                      <CheckCircle2 size={11} /> Stock devuelto
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <span className={styles.subMeta}>Sin desglose de ítems</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className={styles.reasonCell}>
                            <span className={styles.reasonText} title={record.reason || ''}>
                              {record.reason || 'Sin motivo especificado'}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className={styles.methodPill} data-method={mKey}>
                            {renderMethodIcon(record.paymentMethod)}
                            <span>{record.paymentMethod || 'Efectivo'}</span>
                          </span>
                        </td>

                        <td className={styles.amountCell}>{fmtCLP(Number(record.total || 0))}</td>

                        <td style={{ textAlign: 'right' }}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() => setSelectedRecord(record)}
                              className={styles.iconActionBtn}
                              title="Ver detalle completo"
                            >
                              <Eye size={13} />
                              <span>Detalle</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => printReturn(record)}
                              className={styles.iconActionBtn}
                              title="Imprimir respaldo interno"
                            >
                              <Printer size={13} />
                            </button>

                            <Link
                              href={getSaleHref(record)}
                              className={styles.linkActionBtn}
                              title="Ir a la venta original"
                            >
                              <span>Venta</span>
                              <ArrowUpRight size={13} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ─── Mobile & Tablet Cards (<= 980px) ─── */}
            <div className={styles.mobileList}>
              {paginatedRecords.map(record => {
                const key = `mob_${record.returnId || `${record.tipo}_${record.id}`}`
                const folio = record.boletaNumero
                  ? `Boleta #${record.boletaNumero}`
                  : `Ticket #${String(record.saleId || record.id).slice(-6).toUpperCase()}`
                const dt = formatShortDateTime(record.createdAtTs, record.saleFechaStr)
                const items = Array.isArray(record.items) ? record.items : []
                const previewItems = items.slice(0, 2)
                const remainingCount = Math.max(0, items.length - previewItems.length)
                const anyRestock = items.some(it => it.restock) || record.tipo === 'anulacion'
                const mKey = paymentMethodKey(record.paymentMethod)

                return (
                  <article key={key} className={styles.mobileCard} data-kind={record.tipo}>
                    <div className={styles.mobileCardTop}>
                      <div className={styles.mobileCardLeft}>
                        <div className={styles.mobileBoletaRow}>
                          {renderStatusBadge(record.tipo)}
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(record)}
                            className={styles.boletaBtn}
                          >
                            {folio}
                          </button>
                        </div>
                        <span className={styles.subMeta}>{dt.full}</span>
                      </div>

                      <div className={styles.mobileCardRight}>
                        <strong className={styles.mobileAmount}>{fmtCLP(Number(record.total || 0))}</strong>
                        {anyRestock && (
                          <span className={styles.restockTag} style={{ marginTop: 4 }}>
                            <CheckCircle2 size={10} /> Stock OK
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.mobileMetaRow}>
                      <span className={styles.mobileOperator}>
                        <User size={13} />
                        <strong>{record.createdByName || record.cajeroNombre || 'Operador'}</strong>
                        {record.clienteNombre && record.clienteNombre !== 'Cliente' && (
                          <span>· {record.clienteNombre}</span>
                        )}
                      </span>

                      <span className={styles.methodPill} data-method={mKey}>
                        {renderMethodIcon(record.paymentMethod)}
                        <span>{record.paymentMethod || 'Efectivo'}</span>
                      </span>
                    </div>

                    {previewItems.length > 0 && (
                      <div className={styles.mobileItemsBox}>
                        {previewItems.map((it, idx) => (
                          <div key={`${it.sku || idx}-${idx}`} className={styles.mobileItemRow}>
                            <span className={styles.mobileItemName}>
                              <strong>{it.quantity} ×</strong> {it.nombre || it.sku}
                            </span>
                            <span className={styles.mobileItemAmount}>{fmtCLP(Number(it.amount || 0))}</span>
                          </div>
                        ))}
                        {remainingCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(record)}
                            className={styles.boletaBtn}
                            style={{ fontSize: 11.5, color: '#087f73' }}
                          >
                            +{remainingCount} {remainingCount === 1 ? 'artículo más' : 'artículos más'} · ver todo
                          </button>
                        )}
                      </div>
                    )}

                    <div className={styles.mobileReasonRow}>
                      <strong>Motivo:</strong>
                      <span>{record.reason || 'Sin motivo especificado'}</span>
                    </div>

                    <div className={styles.mobileActions}>
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(record)}
                        className={styles.iconActionBtn}
                      >
                        <Eye size={14} />
                        <span>Detalle</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => printReturn(record)}
                        className={styles.iconActionBtn}
                      >
                        <Printer size={14} />
                        <span>Comprobante</span>
                      </button>

                      <Link href={getSaleHref(record)} className={styles.linkActionBtn}>
                        <span>Ver venta</span>
                        <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className={styles.paginationBar}>
            <span className={styles.paginationInfo}>
              Página <strong>{safePage}</strong> de <strong>{totalPages}</strong> · {fmtCount(filteredRecords.length)}{' '}
              operaciones
            </span>
            <div className={styles.paginationBtns}>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={styles.iconActionBtn}
              >
                <ChevronLeft size={14} />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={styles.iconActionBtn}
              >
                <span>Siguiente</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className={styles.footnote}>
        <Clock3 size={14} />
        <span>
          Fechas calculadas en horario de Santiago de Chile. Incluye devoluciones parciales/totales, boletas anuladas e historial de ediciones.
        </span>
      </footer>

      {/* ─── Operation Detail Modal ─── */}
      {selectedRecord && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setSelectedRecord(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
        >
          <div className={styles.modalDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                {renderStatusBadge(selectedRecord.tipo)}
                <h3 id="audit-detail-title">
                  {selectedRecord.boletaNumero
                    ? `Boleta #${selectedRecord.boletaNumero}`
                    : `Ticket #${String(selectedRecord.saleId || selectedRecord.id).slice(-6).toUpperCase()}`}
                </h3>
                <p>{formatShortDateTime(selectedRecord.createdAtTs, selectedRecord.saleFechaStr).full}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className={styles.modalCloseBtn}
                aria-label="Cerrar detalle"
              >
                <X size={17} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalMetaGrid}>
                <div className={styles.modalMetaItem}>
                  <span>Registrado por</span>
                  <strong>{selectedRecord.createdByName || selectedRecord.cajeroNombre || 'Operador'}</strong>
                </div>
                <div className={styles.modalMetaItem}>
                  <span>Cliente</span>
                  <strong>{selectedRecord.clienteNombre || 'Cliente general'}</strong>
                </div>
                <div className={styles.modalMetaItem}>
                  <span>Medio de pago</span>
                  <strong style={{ textTransform: 'capitalize' }}>
                    {selectedRecord.paymentMethod || 'Efectivo'}
                  </strong>
                </div>
                <div className={styles.modalMetaItem}>
                  <span>Fecha venta original</span>
                  <strong>{selectedRecord.saleFechaStr || getRecordDate(selectedRecord) || '—'}</strong>
                </div>
              </div>

              <div className={styles.modalReasonBox}>
                <span>Motivo registrado en caja</span>
                <p>{selectedRecord.reason || 'Sin motivo especificado'}</p>
              </div>

              {Array.isArray(selectedRecord.items) && selectedRecord.items.length > 0 && (
                <div className={styles.modalItemsList}>
                  <div className={styles.modalItemsHeader}>
                    <span>Artículos ({selectedRecord.items.length})</span>
                    <span>Subtotal</span>
                  </div>
                  {selectedRecord.items.map((it, idx) => (
                    <div key={`${it.sku || idx}-${idx}`} className={styles.modalItemRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 650, color: '#16231f' }}>
                          {it.quantity} × {it.nombre || it.sku}
                        </div>
                        <div className={styles.itemsSubRow}>
                          {it.sku && <span className={styles.skuTag}>{it.sku}</span>}
                          {(it.restock || selectedRecord.tipo === 'anulacion') && (
                            <span className={styles.restockTag}>
                              <CheckCircle2 size={10} /> Reingreso a stock
                            </span>
                          )}
                        </div>
                      </div>
                      <strong style={{ flexShrink: 0, color: '#16231f' }}>
                        {fmtCLP(Number(it.amount || 0))}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.modalTotalRow}>
                <span>Monto total de la operación</span>
                <strong>{fmtCLP(Number(selectedRecord.total || 0))}</strong>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => printReturn(selectedRecord)}
                className={styles.actionSecondary}
              >
                <Printer size={15} />
                <span>Imprimir comprobante</span>
              </button>
              <Link href={getSaleHref(selectedRecord)} className={styles.actionPrimary}>
                <ReceiptText size={15} />
                <span>Abrir en Ventas</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
