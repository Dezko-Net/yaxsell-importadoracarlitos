// src/lib/bankReconciliationService.ts
import * as XLSX from 'xlsx'
import { db } from '@/lib/firebase'
import {
  collection,
  limit,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore'

export interface BankMovement {
  id: string
  fecha: string // 'DD/MM/YYYY'
  fechaYMD: string // 'YYYY-MM-DD'
  descripcion: string
  emisor: string
  canal: string
  nroDoc: string
  monto: number
  saldo: number
}

export interface BankCartolaHeader {
  empresa?: string
  titular?: string
  rut?: string
  cuenta?: string
  moneda?: string
  fechaCartola?: string
}

export interface ReconciledWebOrder {
  orderId: string
  orderCode: string
  customerName: string
  customerPhone?: string
  total: number
  status: string
  paymentMethod: string
  createdAt: string
  matchConfidence: 'exact_name' | 'amount_only' | 'already_confirmed'
  confidenceScore: number
}

export interface ReconciledPosSale {
  ventaId: string
  folio: string
  cajeroNombre: string
  total: number
  fechaStr: string
  horaStr: string
  itemsCount: number
}

export interface ReconciledRow {
  bankTx: BankMovement
  matchedWebOrder?: ReconciledWebOrder
  matchedPosSale?: ReconciledPosSale
  status: 'matched_web' | 'matched_pos' | 'unmatched_bank' | 'pending_web_approval'
  notes?: string
}

export interface UnmatchedAlert {
  type: 'pos_without_bank' | 'web_without_bank'
  id: string
  identifier: string
  cliente?: string
  cajero?: string
  monto: number
  fecha: string
  hora?: string
  status?: string
}

// ─── Normalización de nombres para coincidencia difusa ────────────────────────
export function normalizeNameTokens(name: string): string[] {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !['DE', 'DEL', 'LOS', 'LAS', 'SAN', 'SPA', 'SR', 'SRA'].includes(t))
}

export function calculateNameSimilarity(nameA: string, nameB: string): number {
  const tokensA = normalizeNameTokens(nameA)
  const tokensB = normalizeNameTokens(nameB)
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  let matches = 0
  for (const tA of tokensA) {
    if (tokensB.some(tB => tB === tA || tB.startsWith(tA) || tA.startsWith(tB))) {
      matches++
    }
  }

  const minTokens = Math.min(tokensA.length, tokensB.length)
  return Math.min(100, Math.round((matches / minTokens) * 100))
}

// ─── Parseo de Cartola Excel (.xls / .xlsx) ──────────────────────────────────
export function parseBankCartola(dataBuffer: ArrayBuffer | Uint8Array): {
  header: BankCartolaHeader
  movements: BankMovement[]
  availableDates: string[]
} {
  const wb = XLSX.read(dataBuffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  const header: BankCartolaHeader = {}
  let headerRowIdx = -1

  // 1. Detectar cabeceras y metadatos de la cuenta
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue

    const rowStr = row.map(c => String(c || '').trim()).join(' ')
    if (rowStr.includes('Nombre Empresa:')) {
      const idx = row.findIndex(c => String(c).includes('Nombre Empresa:'))
      if (idx !== -1 && row[idx + 1] !== undefined) header.empresa = String(row[idx + 1] || row[idx + 2] || '').trim()
    }
    if (rowStr.includes('Sr(a).:')) {
      const idx = row.findIndex(c => String(c).includes('Sr(a).:'))
      if (idx !== -1) header.titular = String(row[idx + 1] || row[idx + 2] || '').trim()
    }
    if (rowStr.includes('Rut:')) {
      const idx = row.findIndex(c => String(c).includes('Rut:'))
      if (idx !== -1) header.rut = String(row[idx + 1] || row[idx + 2] || '').trim()
    }
    if (rowStr.includes('Cuenta N°:') || rowStr.includes('Cuenta:')) {
      const idx = row.findIndex(c => String(c).includes('Cuenta'))
      if (idx !== -1) header.cuenta = String(row[idx + 1] || row[idx + 2] || '').trim()
    }
    if (rowStr.includes('Moneda:')) {
      const idx = row.findIndex(c => String(c).includes('Moneda:'))
      if (idx !== -1) header.moneda = String(row[idx + 1] || row[idx + 2] || '').trim()
    }

    // Identificar fila de cabecera de la tabla de movimientos
    if (row.some(c => /Descripci[oó]n/i.test(String(c))) && row.some(c => /Abonos|Cargos|Fecha/i.test(String(c)))) {
      headerRowIdx = i
    }
  }

  // Si no se encontró por regex exacto, buscar fila con "Abonos"
  if (headerRowIdx === -1) {
    headerRowIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => /Abonos/i.test(String(c))))
  }

  const movements: BankMovement[] = []
  const datesSet = new Set<string>()

  if (headerRowIdx !== -1) {
    const headerCols = rows[headerRowIdx].map(c => String(c || '').toLowerCase())
    const fechaCol = headerCols.findIndex(c => c.includes('fecha'))
    const descCol = headerCols.findIndex(c => c.includes('descripci'))
    const canalCol = headerCols.findIndex(c => c.includes('canal') || c.includes('sucursal'))
    const docCol = headerCols.findIndex(c => c.includes('docto') || c.includes('doc'))
    const abonoCol = headerCols.findIndex(c => c.includes('abono'))
    const saldoCol = headerCols.findIndex(c => c.includes('saldo'))

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      // Extraer datos usando índices detectados o fallback estándar de Banco de Chile
      const rawFecha = String(row[fechaCol !== -1 ? fechaCol : 1] || '').trim()
      const rawDesc = String(row[descCol !== -1 ? descCol : 3] || '').trim()
      const rawCanal = String(row[canalCol !== -1 ? canalCol : 5] || '').trim()
      const rawDoc = String(row[docCol !== -1 ? docCol : 6] || '').trim()
      const rawAbono = Number(row[abonoCol !== -1 ? abonoCol : 8] || 0)
      const rawSaldo = Number(row[saldoCol !== -1 ? saldoCol : 9] || 0)

      // Solo procesar Abonos (ingresos reales de dinero > 0)
      if (rawAbono > 0 && rawFecha) {
        // Normalizar fecha DD/MM/YYYY -> YYYY-MM-DD
        let fechaYMD = rawFecha
        const m = rawFecha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
        if (m) {
          const dd = m[1].padStart(2, '0')
          const mm = m[2].padStart(2, '0')
          const yyyy = m[3]
          fechaYMD = `${yyyy}-${mm}-${dd}`
        }

        // Limpiar emisor del formato "Traspaso De: NOMBRE APELLIDO" o similar
        let emisor = rawDesc
          .replace(/^Traspaso De:\s*/i, '')
          .replace(/^Transferencia De:\s*/i, '')
          .replace(/^Abono De:\s*/i, '')
          .replace(/^TEF De:\s*/i, '')
          .trim()

        const item: BankMovement = {
          id: `bank_${fechaYMD}_${i}_${rawAbono}`,
          fecha: rawFecha,
          fechaYMD,
          descripcion: rawDesc,
          emisor,
          canal: rawCanal,
          nroDoc: rawDoc,
          monto: rawAbono,
          saldo: rawSaldo,
        }

        movements.push(item)
        datesSet.add(fechaYMD)
      }
    }
  }

  const availableDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a))

  return {
    header,
    movements,
    availableDates,
  }
}

// ─── Motor de Cruce / Triangulación ──────────────────────────────────────────
export async function reconcileCartolaWithDatabase(
  movements: BankMovement[],
  selectedDateYMD?: string
): Promise<{
  rows: ReconciledRow[]
  alerts: UnmatchedAlert[]
  totals: {
    totalBanco: number
    countBanco: number
    totalPos: number
    countPos: number
    totalWeb: number
    countWeb: number
    totalPendienteAprobarWeb: number
    countPendienteAprobarWeb: number
    totalSinIdentificar: number
    countSinIdentificar: number
  }
}> {
  // Filtrar movimientos por fecha seleccionada si se proporciona
  const activeMovements = selectedDateYMD
    ? movements.filter(m => m.fechaYMD === selectedDateYMD)
    : movements

  // 1. Obtener ventas POS por transferencia
  // 🔒 Blindaje: si no hay fecha, limitar a 500 docs para evitar scan total de ventas_pos
  const posSalesQuery = selectedDateYMD
    ? query(
        collection(db!, 'ventas_pos'),
        where('fechaStr', '==', selectedDateYMD),
        where('estado', '==', 'completada')
      )
    : query(collection(db!, 'ventas_pos'), where('estado', '==', 'completada'), limit(500))

  const posSnap = await getDocs(posSalesQuery)
  const posSales: Array<{
    id: string
    folio: string
    cajeroNombre: string
    total: number
    metodoPago: string
    transferenciaMonto: number
    fechaStr: string
    horaStr: string
    itemsCount: number
  }> = []

  posSnap.forEach(d => {
    const data = d.data()
    const metodo = String(data.metodoPago || '').toLowerCase()
    const transfMonto = Number(data.transferencia || (metodo === 'transferencia' ? data.total : 0)) || 0
    if (transfMonto > 0 || metodo === 'transferencia') {
      const items = data.items || []
      posSales.push({
        id: d.id,
        folio: String(data.folioNumero || data.folio || d.id.slice(0, 6)),
        cajeroNombre: String(data.cajeroNombre || 'Caja'),
        total: transfMonto > 0 ? transfMonto : Number(data.total || 0),
        metodoPago: metodo,
        transferenciaMonto: transfMonto,
        fechaStr: String(data.fechaStr || ''),
        horaStr: String(data.horaStr || ''),
        itemsCount: items.length,
      })
    }
  })

  // 2. Obtener pedidos Web / WhatsApp
  // 🔒 Blindaje: limit(200) para evitar scan total de la colección orders
  const ordersSnap = await getDocs(query(collection(db!, 'orders'), limit(200)))
  const webOrders: Array<{
    id: string
    orderCode: string
    customerName: string
    customerPhone: string
    total: number
    status: string
    paymentMethod: string
    createdAt: string
  }> = []

  ordersSnap.forEach(d => {
    if (d.id === '_init') return
    const data = d.data()
    const total = Number(data.TOTAL || data.SUBTOTAL || 0)
    if (total > 0) {
      webOrders.push({
        id: d.id,
        orderCode: String(data.ORDERCODE || d.id.slice(0, 8)),
        customerName: String(data.CUSTOMERNAME || ''),
        customerPhone: String(data.CUSTOMERPHONE || ''),
        total,
        status: String(data.STATUS || 'pending'),
        paymentMethod: String(data.PAYMENTMETHOD || 'Web'),
        createdAt: data.CREATEDAT ? new Date(data.CREATEDAT).toISOString() : '',
      })
    }
  })

  // 3. Triangulación
  const usedPosIds = new Set<string>()
  const usedWebIds = new Set<string>()
  const rows: ReconciledRow[] = []

  // Paso A: Intentar cruzar cada movimiento bancario primero con Pedidos Web (por monto y nombre)
  for (const tx of activeMovements) {
    let matchedWeb: ReconciledWebOrder | undefined = undefined
    let matchedPos: ReconciledPosSale | undefined = undefined

    // Candidatos Web por monto exacto
    const webCandidates = webOrders.filter(
      o => !usedWebIds.has(o.id) && o.total === tx.monto
    )

    if (webCandidates.length > 0) {
      // Buscar el candidato con mejor coincidencia de nombre
      let bestCandidate = webCandidates[0]
      let highestScore = 0

      for (const cand of webCandidates) {
        const score = calculateNameSimilarity(tx.emisor, cand.customerName)
        if (score > highestScore) {
          highestScore = score
          bestCandidate = cand
        }
      }

      // Si hay coincidencia de nombre o el candidato único tiene status relevante
      if (highestScore >= 35 || webCandidates.length === 1) {
        usedWebIds.add(bestCandidate.id)
        const isConfirmed = ['payment_confirmed', 'paid', 'delivered'].includes(bestCandidate.status)
        matchedWeb = {
          orderId: bestCandidate.id,
          orderCode: bestCandidate.orderCode,
          customerName: bestCandidate.customerName,
          customerPhone: bestCandidate.customerPhone,
          total: bestCandidate.total,
          status: bestCandidate.status,
          paymentMethod: bestCandidate.paymentMethod,
          createdAt: bestCandidate.createdAt,
          matchConfidence: highestScore >= 35 ? 'exact_name' : 'amount_only',
          confidenceScore: highestScore,
        }

        rows.push({
          bankTx: tx,
          matchedWebOrder: matchedWeb,
          status: isConfirmed ? 'matched_web' : 'pending_web_approval',
          notes: highestScore >= 35 ? `Coincide nombre: ${bestCandidate.customerName}` : 'Monto exacto',
        })
        continue
      }
    }

    // Paso B: Si no fue pedido web, cruzar con Ventas POS de tienda física
    const posCandidates = posSales.filter(
      p => !usedPosIds.has(p.id) && p.total === tx.monto
    )

    if (posCandidates.length > 0) {
      const bestPos = posCandidates[0]
      usedPosIds.add(bestPos.id)
      matchedPos = {
        ventaId: bestPos.id,
        folio: bestPos.folio,
        cajeroNombre: bestPos.cajeroNombre,
        total: bestPos.total,
        fechaStr: bestPos.fechaStr,
        horaStr: bestPos.horaStr,
        itemsCount: bestPos.itemsCount,
      }

      rows.push({
        bankTx: tx,
        matchedPosSale: matchedPos,
        status: 'matched_pos',
        notes: `Cajero ${bestPos.cajeroNombre} (Boleta #${bestPos.folio})`,
      })
      continue
    }

    // Paso C: Si no coincide con ninguno, es dinero no identificado en la cartola
    rows.push({
      bankTx: tx,
      status: 'unmatched_bank',
      notes: 'Sin venta POS ni pedido Web asociado',
    })
  }

  // 4. Identificar Alertas (Ventas POS o Web marcadas como pagadas que NO están en la cartola)
  const alerts: UnmatchedAlert[] = []

  // Ventas POS no encontradas en el banco
  for (const pos of posSales) {
    if (!usedPosIds.has(pos.id)) {
      alerts.push({
        type: 'pos_without_bank',
        id: pos.id,
        identifier: `Boleta #${pos.folio}`,
        cajero: pos.cajeroNombre,
        monto: pos.total,
        fecha: pos.fechaStr,
        hora: pos.horaStr,
      })
    }
  }

  // 5. Totales
  const totalBanco = activeMovements.reduce((s, m) => s + m.monto, 0)
  const countBanco = activeMovements.length

  const matchedWebRows = rows.filter(r => r.status === 'matched_web')
  const matchedPosRows = rows.filter(r => r.status === 'matched_pos')
  const pendingWebRows = rows.filter(r => r.status === 'pending_web_approval')
  const unmatchedBankRows = rows.filter(r => r.status === 'unmatched_bank')

  return {
    rows,
    alerts,
    totals: {
      totalBanco,
      countBanco,
      totalPos: matchedPosRows.reduce((s, r) => s + r.bankTx.monto, 0),
      countPos: matchedPosRows.length,
      totalWeb: matchedWebRows.reduce((s, r) => s + r.bankTx.monto, 0),
      countWeb: matchedWebRows.length,
      totalPendienteAprobarWeb: pendingWebRows.reduce((s, r) => s + r.bankTx.monto, 0),
      countPendienteAprobarWeb: pendingWebRows.length,
      totalSinIdentificar: unmatchedBankRows.reduce((s, r) => s + r.bankTx.monto, 0),
      countSinIdentificar: unmatchedBankRows.length,
    },
  }
}

// ─── Acción: Aprobar Pedido Web y Marcar Pagado en Firestore ─────────────────
export async function approveWebOrderFromBank(
  orderId: string,
  bankTx: BankMovement
): Promise<void> {
  const orderRef = doc(db!, 'orders', orderId)
  await updateDoc(orderRef, {
    STATUS: 'payment_confirmed',
    PAYMENTSTATUS: 'paid',
    bankReconciled: true,
    bankReconciledAt: new Date().toISOString(),
    bankTx: {
      emisor: bankTx.emisor,
      monto: bankTx.monto,
      fecha: bankTx.fecha,
      nroDoc: bankTx.nroDoc || '',
      canal: bankTx.canal || '',
    },
    UPDATEDAT: Date.now(),
  })
}
