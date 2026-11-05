import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
  where,
} from 'firebase/firestore'
import type { SedeSlug } from '@/types'

export type ExternalFixedExpense = {
  id: string
  name: string
  amount: number
  active: boolean
  category: string
  /** First month this recurring amount applies, in YYYY-MM format. */
  startMonth?: string
  /** Last month this recurring amount applies, in YYYY-MM format. */
  endMonth?: string
}

export type ExternalManualExpense = {
  id: string
  sede: SedeSlug
  date: string
  reason: string
  amount: number
  category: string
  createdAtMs: number
}

export type ExternalExpenseReportItem = {
  id: string
  source: 'fixed' | 'manual'
  fecha: string
  dia: number
  monto: number
  categoria: string
  tipo: string
  descripcion: string
}

const BASE_FIXED_EXPENSES: ExternalFixedExpense[] = [
  { id: 'rent', name: 'Arriendo de local', amount: 650000, active: true, category: 'Gasto fijo' },
  { id: 'water', name: 'Agua potable', amount: 45000, active: true, category: 'Servicios básicos' },
  { id: 'power', name: 'Electricidad', amount: 120000, active: true, category: 'Servicios básicos' },
  { id: 'internet', name: 'Internet y Telefonía', amount: 35000, active: true, category: 'Servicios básicos' },
]

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function getMonthInfo(monthId: string) {
  const [yearRaw, monthRaw] = monthId.split('-')
  const year = Number(yearRaw) || new Date().getFullYear()
  const month = Number(monthRaw) || new Date().getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  return { year, month, daysInMonth }
}

function normalizeFixedExpense(raw: any, fallback: ExternalFixedExpense): ExternalFixedExpense {
  return {
    id: String(raw?.id || fallback.id),
    name: String(raw?.name || fallback.name),
    amount: Math.max(0, Number(raw?.amount ?? fallback.amount) || 0),
    active: raw?.active !== false,
    category: String(raw?.category || fallback.category),
    ...(typeof raw?.startMonth === 'string' && raw.startMonth ? { startMonth: raw.startMonth } : {}),
    ...(typeof raw?.endMonth === 'string' && raw.endMonth ? { endMonth: raw.endMonth } : {}),
  }
}

function normalizeManualExpense(raw: any, sede: SedeSlug, id: string): ExternalManualExpense {
  return {
    id,
    sede,
    date: String(raw?.date || ''),
    reason: String(raw?.reason || raw?.descripcion || ''),
    amount: Math.max(0, Number(raw?.amount || raw?.monto) || 0),
    category: String(raw?.category || 'Gasto externo'),
    createdAtMs: Number(raw?.createdAtMs) || 0,
  }
}

export function getDefaultFixedExpenses(sede: SedeSlug): ExternalFixedExpense[] {
  return BASE_FIXED_EXPENSES.map((item) => ({
    ...item,
    id: `${sede}-${item.id}`,
  }))
}

export async function loadExternalExpensesConfig(db: Firestore, sede: SedeSlug): Promise<ExternalFixedExpense[]> {
  try {
    const ref = doc(db, 'external_expenses', sede)
    const snap = await getDoc(ref)
    const defaults = getDefaultFixedExpenses(sede)

    if (!snap.exists()) {
      return defaults
    }

    const rawItems = Array.isArray(snap.data()?.fixedItems) ? snap.data()?.fixedItems : []
    if (!rawItems.length) {
      return defaults
    }

    const fallbackMap = new Map(defaults.map((item) => [item.id, item]))
    return rawItems.map((item: any, index: number) => {
      const fallback = fallbackMap.get(String(item?.id || '')) || defaults[index] || defaults[0]
      return normalizeFixedExpense(item, fallback)
    })
  } catch (err) {
    console.error('[externalExpenses] Error loading config:', err)
    return getDefaultFixedExpenses(sede)
  }
}

export async function saveExternalExpensesConfig(
  db: Firestore,
  sede: SedeSlug,
  items: ExternalFixedExpense[],
): Promise<ExternalFixedExpense[]> {
  const ref = doc(db, 'external_expenses', sede)
  const cleanItems = items.map((item) => ({
    id: String(item.id),
    name: String(item.name || 'Gasto fijo externo'),
    amount: Math.max(0, Number(item.amount) || 0),
    active: item.active !== false,
    category: String(item.category || 'Gasto fijo'),
    ...(item.startMonth ? { startMonth: String(item.startMonth) } : {}),
    ...(item.endMonth ? { endMonth: String(item.endMonth) } : {}),
  }))

  await setDoc(
    ref,
    {
      sede,
      fixedItems: cleanItems,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  return cleanItems
}

export async function listExternalExpenseEntriesForMonth(
  db: Firestore,
  sede: SedeSlug,
  monthId: string,
): Promise<ExternalManualExpense[]> {
  try {
    // 🔒 Blindaje: filtrar por mes directamente en Firestore (monthId formato YYYY-MM)
    const dateFrom = `${monthId}-01`
    const dateTo = `${monthId}-31`
    const snap = await getDocs(
      query(
        collection(db, 'external_expenses', sede, 'entries'),
        where('date', '>=', dateFrom),
        where('date', '<=', dateTo)
      )
    )
    const out: ExternalManualExpense[] = []

    snap.forEach((docSnap) => {
      const entry = normalizeManualExpense(docSnap.data(), sede, docSnap.id)
      out.push(entry)
    })

    out.sort((a, b) => a.date.localeCompare(b.date) || b.createdAtMs - a.createdAtMs)
    return out
  } catch (err) {
    console.error('[externalExpenses] Error listing entries:', err)
    return []
  }
}

export async function addExternalExpenseEntry(
  db: Firestore,
  sede: SedeSlug,
  payload: { date: string; reason: string; amount: number; category?: string },
): Promise<ExternalManualExpense> {
  const colRef = collection(db, 'external_expenses', sede, 'entries')
  const newDocRef = doc(colRef)
  const next = {
    sede,
    date: payload.date,
    reason: String(payload.reason || ''),
    amount: Math.max(0, Number(payload.amount) || 0),
    category: String(payload.category || 'Gasto externo'),
    createdAtMs: Date.now(),
  }

  await setDoc(newDocRef, {
    ...next,
    createdAt: serverTimestamp(),
  })

  return {
    id: newDocRef.id,
    ...next,
  }
}

export async function deleteExternalExpenseEntry(db: Firestore, sede: SedeSlug, id: string): Promise<void> {
  await deleteDoc(doc(db, 'external_expenses', sede, 'entries', id))
}

export function buildMonthDateRange(monthId: string): string[] {
  const { year, month, daysInMonth } = getMonthInfo(monthId)
  return Array.from({ length: daysInMonth }, (_, index) => `${year}-${pad2(month)}-${pad2(index + 1)}`)
}

export function buildVisibleDateRange(
  monthId: string,
  range: 'full' | 'first' | 'second' | 's1' | 's2' | 's3' | 's4',
): string[] {
  const dates = buildMonthDateRange(monthId)
  if (range === 'first') return dates.filter((date) => Number(date.slice(-2)) <= 15)
  if (range === 'second') return dates.filter((date) => Number(date.slice(-2)) > 15)
  if (range === 's1') return dates.filter((date) => { const d = Number(date.slice(-2)); return d >= 1 && d <= 7 })
  if (range === 's2') return dates.filter((date) => { const d = Number(date.slice(-2)); return d >= 8 && d <= 14 })
  if (range === 's3') return dates.filter((date) => { const d = Number(date.slice(-2)); return d >= 15 && d <= 21 })
  if (range === 's4') return dates.filter((date) => { const d = Number(date.slice(-2)); return d >= 22 })
  return dates
}

export function buildExternalExpenseBreakdown(
  monthId: string,
  visibleDates: string[],
  fixedItems: ExternalFixedExpense[],
  manualEntries: ExternalManualExpense[],
  workingDates?: string[],
) {
  const monthDates = buildMonthDateRange(monthId)
  const visibleSet = new Set(visibleDates)
  const dayAmountsByDate: Record<string, number> = {}
  const reportItems: ExternalExpenseReportItem[] = []

  monthDates.forEach((date) => {
    dayAmountsByDate[date] = 0
  })

  const activeFixed = fixedItems.filter((item) =>
    item.active &&
    Number(item.amount) > 0 &&
    (!item.startMonth || item.startMonth <= monthId) &&
    (!item.endMonth || item.endMonth >= monthId),
  )
  const distributionDates = (workingDates && workingDates.length > 0) ? workingDates : monthDates
  const distributionDayCount = Math.max(1, distributionDates.length)
  const distributionSet = new Set(distributionDates)

  activeFixed.forEach((item) => {
    const perDay = Number(item.amount) / distributionDayCount
    distributionDates.forEach((date) => {
      dayAmountsByDate[date] = (dayAmountsByDate[date] || 0) + perDay
    })

    const visibleWorkingCount = visibleDates.filter((date) => distributionSet.has(date)).length
    const visibleAmount = visibleWorkingCount * perDay
    if (visibleAmount > 0) {
      const firstVisible = visibleDates[0] || monthDates[0]
      reportItems.push({
        id: item.id,
        source: 'fixed',
        fecha: firstVisible,
        dia: Number(firstVisible.slice(-2)),
        monto: Math.round(visibleAmount),
        categoria: item.category,
        tipo: 'Gasto fijo externo',
        descripcion: item.name,
      })
    }
  })

  manualEntries.forEach((entry) => {
    if (!visibleSet.has(entry.date)) return
    dayAmountsByDate[entry.date] = (dayAmountsByDate[entry.date] || 0) + Number(entry.amount || 0)
    reportItems.push({
      id: entry.id,
      source: 'manual',
      fecha: entry.date,
      dia: Number(entry.date.slice(-2)),
      monto: Number(entry.amount || 0),
      categoria: entry.category || 'Gasto externo',
      tipo: 'Gasto externo manual',
      descripcion: entry.reason,
    })
  })

  reportItems.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.descripcion.localeCompare(b.descripcion))

  const fixedVisibleTotal = reportItems
    .filter((item) => item.source === 'fixed')
    .reduce((sum, item) => sum + Number(item.monto || 0), 0)

  const manualVisibleTotal = reportItems
    .filter((item) => item.source === 'manual')
    .reduce((sum, item) => sum + Number(item.monto || 0), 0)

  return {
    reportItems,
    dayAmountsByDate,
    fixedVisibleTotal,
    manualVisibleTotal,
    totalVisible: fixedVisibleTotal + manualVisibleTotal,
  }
}
