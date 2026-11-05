'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowDown, Boxes, Check, ChevronDown, ClipboardPaste, Clock3, Download,
  FileSpreadsheet, Info, PackageCheck, Plus, RefreshCw, Sparkles, Upload, X,
} from 'lucide-react'
import { auth } from '@/lib/firebase'
import { clearPosProductsCache, fetchAllFirebaseErpProducts, isAppwriteProduct, type FirebaseErpProduct } from '@/lib/firebaseErpService'

type Screen = 'home' | 'methods' | 'import' | 'paste' | 'ai' | 'review' | 'history'
type ReceiptSource = 'excel' | 'pegado' | 'ia'
type FieldKey = 'codigo_barra' | 'costo_uni' | 'precio_venta_1' | 'precio_venta_2' | 'precio_venta_3' | 'precio_venta_4' | 'category' | 'subcategory' | 'proveedor' | 'cantidad_embalaje' | 'box_code' | 'label_p2' | 'label_p3' | 'min_qty_2' | 'min_qty_3' | 'description' | 'imageUrl'
type ReceiptChanges = Partial<Record<FieldKey, string | number>>
type PreviewRow = {
  rowNumber: number
  sku: string
  nombre: string
  delta: number
  changes: ReceiptChanges
  product?: FirebaseErpProduct
  errors: string[]
  warnings: string[]
  noQuantity?: boolean
}

const fmtQty = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(value || 0))
const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
const normalizeSku = (value: unknown) => String(value ?? '').trim().toUpperCase()
const isMainStoreProduct = (product: FirebaseErpProduct) => {
  const data = (product.rawDocument || {}) as Record<string, unknown>
  if (data.isVendorProduct === true || data.IS_VENDOR_PRODUCT === true) return false
  const seller = String(data.SELLERID || data.sellerId || data.VENDOR_ID || data.vendorId || '').trim()
  return !seller || seller === '__MAIN__' || seller === 'donbalato'
}

function localizedNumber(value: unknown): number | null {
  const rawValue = value
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : null
  const text = String(rawValue ?? '').trim()
  if (!text) return null
  let cleaned = text.replace(/\s/g, '').replace(/\$/g, '').replace(/CLP/gi, '').replace(/[^0-9,.-]/g, '')
  if (!cleaned || !/^-?[0-9.,]+$/.test(cleaned)) return null
  const comma = cleaned.lastIndexOf(',')
  const dot = cleaned.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    const thousands = decimal === ',' ? /\./g : /,/g
    cleaned = cleaned.replace(thousands, '').replace(decimal, '.')
  } else if (comma >= 0) {
    const decimals = cleaned.length - comma - 1
    cleaned = decimals > 0 && decimals <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (dot >= 0) {
    const decimals = cleaned.length - dot - 1
    cleaned = decimals === 3 ? cleaned.replace(/\./g, '') : cleaned
  }
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function headerField(value: unknown): string | null {
  const key = normalizeHeader(value)
  if (!key) return null
  if (key === 'sku' || key === 'codigosku' || key === 'codigoproducto') return 'sku'
  if (key.startsWith('nombre') || key === 'producto') return 'nombre'
  if (key.startsWith('cantidadingresar') || key.startsWith('cantidadrecepcion') || key.startsWith('unidadesingresar') || key === 'cantidad') return 'delta'
  if (key.startsWith('codigodebarra') || key.startsWith('codigobarra') || key === 'barcode') return 'codigo_barra'
  if (key.startsWith('costounitario') || key === 'costo' || key === 'costouni') return 'costo_uni'
  if (key === 'p1' || key.startsWith('p1efectivo') || key === 'precio1' || key === 'preciop1' || key === 'precioventa1' || key === 'precioefectivo') return 'precio_venta_1'
  if (key === 'p2' || key.startsWith('p2embalaje') || key === 'precio2' || key === 'preciop2' || key === 'precioventa2') return 'precio_venta_2'
  if (key === 'p3' || key.startsWith('p3embalaje') || key === 'precio3' || key === 'preciop3' || key === 'precioventa3') return 'precio_venta_3'
  if (key === 'p4' || key.startsWith('p4especial') || key === 'precio4' || key === 'preciop4' || key === 'precioventa4') return 'precio_venta_4'
  if (key === 'categoria' || key === 'category') return 'category'
  if (key === 'subcategoria' || key === 'subcategory') return 'subcategory'
  if (key === 'proveedor' || key === 'supplier') return 'proveedor'
  if (key.startsWith('unidadesporembalaje') || key.startsWith('cantidadporembalaje') || key === 'packageqty') return 'cantidad_embalaje'
  if (key.startsWith('codigodecaja') || key === 'boxcode') return 'box_code'
  if (key === 'etiquetap2' || key === 'labelp2') return 'label_p2'
  if (key === 'etiquetap3' || key === 'labelp3') return 'label_p3'
  if (key.startsWith('cantidadminimap2') || key === 'minqty2') return 'min_qty_2'
  if (key.startsWith('cantidadminimap3') || key === 'minqty3') return 'min_qty_3'
  if (key === 'descripcion' || key === 'description') return 'description'
  if (key === 'urldeimagen' || key === 'imagen' || key === 'imageurl') return 'imageUrl'
  return null
}

const optionalStringFields: FieldKey[] = ['codigo_barra', 'category', 'subcategory', 'proveedor', 'cantidad_embalaje', 'box_code', 'label_p2', 'label_p3', 'description', 'imageUrl']
const optionalNumberFields: FieldKey[] = ['costo_uni', 'precio_venta_1', 'precio_venta_2', 'precio_venta_3', 'precio_venta_4', 'min_qty_2', 'min_qty_3']

function makePreviewRow(raw: any, rowNumber: number, productBySku: Map<string, FirebaseErpProduct>): PreviewRow {
  const sku = normalizeSku(raw?.sku)
  const nombre = String(raw?.nombre ?? '').trim()
  const numericDelta = raw?.delta === undefined || raw?.delta === null || raw?.delta === '' ? 0 : localizedNumber(raw.delta)
  const errors: string[] = []
  const warnings: string[] = []
  if (!sku) errors.push('Falta SKU.')
  if (!nombre) errors.push('Falta nombre.')
  if (numericDelta === null || !Number.isInteger(numericDelta)) errors.push('La cantidad debe ser un número entero, positivo o negativo.')
  if (Math.abs(numericDelta ?? 0) > 1_000_000) errors.push('La cantidad supera el límite por producto.')
  const changes: ReceiptChanges = {}
  const sourceChanges = raw?.changes && typeof raw.changes === 'object' ? raw.changes : {}
  for (const key of optionalStringFields) {
    const value = sourceChanges[key]
    if (value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '--') changes[key] = String(value).trim()
  }
  for (const key of optionalNumberFields) {
    const value = sourceChanges[key]
    if (value === null || value === undefined || String(value).trim() === '' || String(value).trim() === '--') continue
    const parsed = localizedNumber(value)
    if (parsed === null || parsed < 0) errors.push(`${key.replace(/_/g, ' ')} debe ser un número igual o mayor a 0.`)
    else changes[key] = Math.round(parsed)
  }
  const product = sku ? productBySku.get(sku) : undefined
  if (!product && sku && (changes.costo_uni === undefined || Number(changes.costo_uni) <= 0)) warnings.push('Si el SKU no existe, completa un costo mayor a 0.')
  if (!product && sku && (changes.precio_venta_1 === undefined || Number(changes.precio_venta_1) <= 0)) warnings.push('Si el SKU no existe, completa P1 mayor a 0.')
  if (!product && sku && Number(numericDelta || 0) < 0) warnings.push('Si el SKU realmente no existe, no puede comenzar con una cantidad negativa.')
  const noQuantity = raw?.delta === undefined || raw?.delta === null || raw?.delta === ''
  if (noQuantity) warnings.push('No se indicó cantidad; el stock no cambiará.')
  return { rowNumber, sku, nombre, delta: numericDelta ?? 0, changes, product, errors, warnings, noQuantity }
}

function parsePasteRows(text: string, productBySku: Map<string, FirebaseErpProduct>): PreviewRow[] {
  return text.split(/\r?\n/).map((line, index) => ({ line: line.trim(), rowNumber: index + 1 }))
    .filter(item => item.line)
    .map(({ line, rowNumber }) => {
      if (/^sku\s*-\s*nombre\s*-\s*costo/i.test(line)) return null
      // También aceptar tablas copiadas desde Excel/Sheets en el mismo orden visible.
      if (line.includes('\t')) {
        const fields = line.split('\t').map(value => value.trim())
        if (headerField(fields[0]) === 'sku') return null
        const [sku, nombre, costo, p1, delta, barcode, p2, p3, p4] = fields
        return makePreviewRow({ sku, nombre, delta, changes: {
          codigo_barra: barcode, costo_uni: costo, precio_venta_1: p1, precio_venta_2: p2,
          precio_venta_3: p3, precio_venta_4: p4,
        } }, rowNumber, productBySku)
      }

      // Compatibilidad con el primer formato mostrado anteriormente.
      if (line.includes('|')) {
        const fields = line.split('|').map(value => value.trim())
        if (headerField(fields[0]) === 'sku') return null
        const [sku, barcode, nombre, costo, p1, p2, p3, p4, delta] = fields
        const changes: ReceiptChanges = {
          codigo_barra: barcode, costo_uni: costo, precio_venta_1: p1, precio_venta_2: p2,
          precio_venta_3: p3, precio_venta_4: p4,
        }
        return makePreviewRow({ sku, nombre, delta, changes }, rowNumber, productBySku)
      }

      // Primero intenta reconocer el SKU completo desde el catálogo (incluye SKU con guiones).
      const upperLine = normalizeSku(line)
      const knownSku = [...productBySku.keys()]
        .filter(candidate => upperLine.startsWith(`${candidate}-`))
        .sort((a, b) => b.length - a.length)[0]
      let sku = ''
      let suffix = ''
      let barcodeOmitted = false
      if (knownSku) {
        sku = knownSku
        const afterSku = line.slice(knownSku.length)
        if (afterSku.startsWith('--')) {
          // Compatibilidad: doble guion entre SKU y nombre indica que se omitió el código.
          suffix = afterSku.slice(2)
          barcodeOmitted = true
        } else {
          suffix = afterSku.slice(1)
        }
      } else {
        // Si el doble guion aparece después de costo, P1 y cantidad, salta el código de barra.
        // Si aparece antes, también permite separar un SKU nuevo que contiene guiones.
        const doubleBoundary = line.indexOf('--')
        const beforeDouble = doubleBoundary > 0 ? line.slice(0, doubleBoundary).split('-').map(value => value.trim()) : []
        const markerFollowsMainFields = beforeDouble.length >= 4 && beforeDouble.slice(-3).every(value => value !== '' && localizedNumber(value) !== null)
        if (doubleBoundary > 0 && !markerFollowsMainFields) {
          sku = line.slice(0, doubleBoundary).trim()
          suffix = line.slice(doubleBoundary + 2)
          barcodeOmitted = true
        } else {
          const boundary = line.indexOf('-')
          if (boundary <= 0) throw new Error(`Fila ${rowNumber}: usa SKU-NOMBRE-COSTO-P1-CANTIDAD. Ejemplo: P10-TAZA DE X-300-500-10`)
          sku = line.slice(0, boundary).trim()
          suffix = line.slice(boundary + 1)
        }
      }

      // Se ubica costo, P1 y cantidad desde los campos numéricos, dejando intactos guiones del nombre.
      const parts = suffix.split('-').map(value => value.trim())
      const numericOrBlank = (value: string) => value === '' || localizedNumber(value) !== null
      const coreStarts: number[] = []
      for (let index = 1; index <= parts.length - 3; index++) {
        const [costValue, p1Value, quantityValue] = parts.slice(index, index + 3)
        const quantity = localizedNumber(quantityValue)
        if (numericOrBlank(costValue) && numericOrBlank(p1Value) && quantity !== null && Number.isInteger(quantity)) coreStarts.push(index)
      }
      const coreStart = coreStarts[0]
      if (coreStart === undefined) throw new Error(`Fila ${rowNumber}: falta cantidad o revisa el orden. Usa SKU-NOMBRE-COSTO-P1-CANTIDAD.`)
      const nombre = parts.slice(0, coreStart).join('-').trim()
      const [costo, p1, delta] = parts.slice(coreStart, coreStart + 3)
      const secondary = parts.slice(coreStart + 3)
      if (!nombre) throw new Error(`Fila ${rowNumber}: falta el nombre del producto.`)
      if (secondary.length > 4) throw new Error(`Fila ${rowNumber}: después de cantidad solo admite código de barra, P2, P3 y P4.`)

      let barcode = ''
      let secondaryPrices: string[] = []
      if (barcodeOmitted) {
        secondaryPrices = secondary
      } else if (secondary[0] === '') {
        // Un campo vacío después de cantidad salta código de barra y conserva los precios posteriores.
        secondaryPrices = secondary.slice(1)
      } else {
        const firstSecondary = secondary[0] || ''
        const looksLikeBarcode = firstSecondary !== '' && (
          localizedNumber(firstSecondary) === null || /^\d{8,14}$/.test(firstSecondary)
        )
        if (looksLikeBarcode || secondary.length === 4) {
          barcode = firstSecondary
          secondaryPrices = secondary.slice(1)
        } else {
          secondaryPrices = secondary
        }
      }
      const changes: ReceiptChanges = {}
      const [p2 = '', p3 = '', p4 = ''] = secondaryPrices
      const optionalValues: [FieldKey, string][] = [
        ['codigo_barra', barcode], ['costo_uni', costo], ['precio_venta_1', p1],
        ['precio_venta_2', p2], ['precio_venta_3', p3], ['precio_venta_4', p4],
      ]
      for (const [key, value] of optionalValues) if (value && value !== '--') changes[key] = value
      return makePreviewRow({ sku, nombre, delta: delta === '--' ? undefined : delta, changes }, rowNumber, productBySku)
    })
    .filter((row): row is PreviewRow => Boolean(row))
}

const pasteHeader = 'SKU-NOMBRE-COSTO-P1-CANTIDAD-CODIGO_BARRA-P2-P3-P4'
const pasteExample = 'P10-TAZA DE X-300-500-10'
const pasteFullExample = 'P10-TAZA DE X-300-500-10-7801234567890-600-700-800'
const pasteSkipBarcodeExample = 'P10-TAZA DE X-300-500-10--600-700-800'

function catalogSkuMap(items: FirebaseErpProduct[]) {
  const result = new Map<string, FirebaseErpProduct>()
  for (const product of items) if (!isAppwriteProduct(product) && isMainStoreProduct(product)) result.set(normalizeSku(product.sku), product)
  return result
}

function markDuplicateSkus(rows: PreviewRow[]) {
  const counts = new Map<string, number>()
  rows.forEach(row => { if (row.sku) counts.set(row.sku, (counts.get(row.sku) || 0) + 1) })
  return rows.map(row => {
    const errors = row.errors.filter(error => !error.includes('está repetido en el archivo.'))
    if (row.sku && (counts.get(row.sku) || 0) > 1) errors.push(`El SKU ${row.sku} está repetido en el archivo.`)
    return { ...row, errors }
  })
}

async function downloadTemplate() {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Inicia sesión para descargar la plantilla.')
  const response = await fetch('/api/erp/recepciones?plantilla=xlsx', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || 'No se pudo generar la plantilla.')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'plantilla-recepcion-don-balato.xlsx'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function timestamp(record: any): number {
  const raw = record?.createdAtTs
  if (typeof raw === 'number') return raw
  if (raw && typeof raw.toMillis === 'function') return raw.toMillis()
  return 0
}

function formatDate(value: number) {
  return value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Fecha no disponible'
}

export default function PosAdminRecepcionesPage() {
  const params = useParams<{ sede: string }>()
  const sede = String(params?.sede || 'donbalato-central')
  const fileInput = useRef<HTMLInputElement>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [fileName, setFileName] = useState('')
  const [receiptSource, setReceiptSource] = useState<ReceiptSource>('excel')
  const [inputText, setInputText] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [loadingFile, setLoadingFile] = useState(false)
  const [loadingAi, setLoadingAi] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [products, setProducts] = useState<FirebaseErpProduct[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [expandedId, setExpandedId] = useState('')
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const handleTopBack = (event: Event) => {
      if (screen === 'methods' || screen === 'history') {
        event.preventDefault()
        setScreen('home')
        setError('')
        setMessage('')
      } else if (screen === 'import' || screen === 'paste' || screen === 'ai' || screen === 'review') {
        event.preventDefault()
        setScreen('methods')
        setError('')
        setMessage('')
      }
    }
    window.addEventListener('pos-admin-back', handleTopBack)
    return () => window.removeEventListener('pos-admin-back', handleTopBack)
  }, [screen])

  const productBySku = useMemo(() => {
    const result = new Map<string, FirebaseErpProduct>()
    for (const product of products) {
      if (!isAppwriteProduct(product) && isMainStoreProduct(product)) result.set(normalizeSku(product.sku), product)
    }
    return result
  }, [products])

  const updateEditedRow = (rowNumber: number, field: string, value: string) => {
    setRows(current => {
      let next = current.map(row => {
        if (row.rowNumber !== rowNumber) return row
        let updated: PreviewRow = { ...row, changes: { ...row.changes } }
        const errorMatchers: Record<string, string[]> = {
          sku: ['Falta SKU.'], nombre: ['Falta nombre.'], delta: ['La cantidad debe ser un número entero, positivo o negativo.', 'La cantidad supera el límite por producto.'],
        }
        if (field === 'sku') {
          updated.sku = normalizeSku(value)
          updated.product = productBySku.get(updated.sku)
        } else if (field === 'nombre') updated.nombre = value
        else if (field === 'delta') { updated.delta = value.trim() ? (localizedNumber(value) ?? Number.NaN) : 0; updated.noQuantity = false }
        else if ((optionalStringFields as string[]).includes(field)) {
          const key = field as FieldKey
          if (value.trim()) updated.changes[key] = value.trim()
          else delete updated.changes[key]
        } else if ((optionalNumberFields as string[]).includes(field)) {
          const key = field as FieldKey
          const parsed = value.trim() ? localizedNumber(value) : null
          if (value.trim()) updated.changes[key] = parsed ?? value
          else delete updated.changes[key]
        }
        const matchers = errorMatchers[field] || [`${field.replace(/_/g, ' ')} debe ser un número igual o mayor a 0.`]
        updated.errors = updated.errors.filter(error => !matchers.includes(error))
        if (field === 'sku' && !updated.sku) updated.errors.push('Falta SKU.')
        if (field === 'nombre' && !updated.nombre.trim()) updated.errors.push('Falta nombre.')
        if (field === 'delta') {
          if (!Number.isInteger(updated.delta)) updated.errors.push('La cantidad debe ser un número entero, positivo o negativo.')
          else if (Math.abs(updated.delta) > 1_000_000) updated.errors.push('La cantidad supera el límite por producto.')
        }
        if ((optionalNumberFields as string[]).includes(field) && value.trim()) {
          const parsed = localizedNumber(value)
          if (parsed === null || parsed < 0) updated.errors.push(`${field.replace(/_/g, ' ')} debe ser un número igual o mayor a 0.`)
        }
        updated.warnings = []
        if (!updated.product && updated.sku && (updated.changes.costo_uni === undefined || Number(updated.changes.costo_uni) <= 0)) updated.warnings.push('Si el SKU no existe, completa un costo mayor a 0.')
        if (!updated.product && updated.sku && (updated.changes.precio_venta_1 === undefined || Number(updated.changes.precio_venta_1) <= 0)) updated.warnings.push('Si el SKU no existe, completa P1 mayor a 0.')
        if (!updated.product && updated.sku && updated.delta < 0) updated.warnings.push('Si el SKU realmente no existe, no puede comenzar con una cantidad negativa.')
        if (updated.noQuantity) updated.warnings.push('No se indicó cantidad; el stock no cambiará.')
        return updated
      })
      const counts = new Map<string, number>()
      next.forEach(row => { if (row.sku) counts.set(row.sku, (counts.get(row.sku) || 0) + 1) })
      next = next.map(row => {
        const errors = row.errors.filter(error => !error.startsWith('El SKU ') || !error.includes('está repetido en el archivo.'))
        if (row.sku && (counts.get(row.sku) || 0) > 1) errors.push(`El SKU ${row.sku} está repetido en el archivo.`)
        return { ...row, errors }
      })
      return next
    })
  }

  const copyPasteText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage(`${label} copiado al portapapeles.`)
      setError('')
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el formato y cópialo manualmente.')
    }
  }

  const invalidCount = rows.reduce((sum, row) => sum + row.errors.length, 0)
  const addedUnits = rows.reduce((sum, row) => sum + Math.max(0, row.delta), 0)
  const removedUnits = rows.reduce((sum, row) => sum + Math.max(0, -row.delta), 0)
  const newCount = rows.filter(row => !row.product).length
  const updateCount = rows.length - newCount

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    setError('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Inicia sesión para consultar las recepciones.')
      const response = await fetch(`/api/erp/recepciones?sede=${encodeURIComponent(sede)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudieron cargar las recepciones.')
      setRecords(payload.records || [])
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar las recepciones.')
    } finally { setLoadingHistory(false) }
  }, [sede])

  const selectFile = async (file?: File) => {
    if (!file) return
    setLoadingFile(true)
    setError('')
    setMessage('')
    setRows([])
    setFileName(file.name)
    setReceiptSource('excel')
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Carga la plantilla en formato .xlsx para conservar sus columnas y validaciones.')
      const excel = await import('xlsx')
      const workbook = excel.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
      const sheetName = workbook.SheetNames[0]
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
      if (!sheet) throw new Error('El archivo no tiene una hoja de cálculo.')
      const matrix = excel.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }) as any[][]
      let headerRowIndex = -1
      let columnIndexes = new Map<number, string>()
      for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 12); rowIndex++) {
        const found = new Map<number, string>()
        ;(matrix[rowIndex] || []).forEach((value, columnIndex) => {
          const field = headerField(value)
          if (field) found.set(columnIndex, field)
        })
        if ([...found.values()].includes('sku') && [...found.values()].includes('nombre') && [...found.values()].includes('delta')) {
          headerRowIndex = rowIndex
          columnIndexes = found
          break
        }
      }
      if (headerRowIndex < 0) throw new Error('No encontré las columnas SKU, Nombre del producto y Cantidad a ingresar. Usa la plantilla descargable.')

      const parsed: PreviewRow[] = []
      for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex++) {
        const excelRow = matrix[rowIndex] || []
        const values: Record<string, any> = {}
        for (const [columnIndex, field] of columnIndexes) values[field] = excelRow[columnIndex]
        const populated = Object.values(values).some(value => value !== null && value !== undefined && String(value).trim() !== '')
        if (!populated) continue
        const sku = normalizeSku(values.sku)
        const nombre = String(values.nombre ?? '').trim()
        const numericDelta = localizedNumber(values.delta)
        const errors: string[] = []
        const warnings: string[] = []
        if (!sku) errors.push('Falta SKU.')
        if (!nombre) errors.push('Falta nombre.')
        if (numericDelta === null || !Number.isInteger(numericDelta)) errors.push('La cantidad debe ser un número entero, positivo o negativo.')
        if (Math.abs(numericDelta ?? 0) > 1_000_000) errors.push('La cantidad supera el límite por producto.')
        const changes: ReceiptChanges = {}
        for (const key of ['codigo_barra', 'category', 'subcategory', 'proveedor', 'cantidad_embalaje', 'box_code', 'label_p2', 'label_p3', 'description', 'imageUrl'] as FieldKey[]) {
          const value = values[key]
          if (value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '--') changes[key] = String(value).trim()
        }
        for (const key of ['costo_uni', 'precio_venta_1', 'precio_venta_2', 'precio_venta_3', 'precio_venta_4', 'min_qty_2', 'min_qty_3'] as FieldKey[]) {
          const value = values[key]
          if (value === null || value === undefined || String(value).trim() === '' || String(value).trim() === '--') continue
          const parsedNumber = localizedNumber(value)
          if (parsedNumber === null || parsedNumber < 0) errors.push(`${key.replace(/_/g, ' ')} debe ser un número igual o mayor a 0.`)
          else changes[key] = Math.round(parsedNumber)
        }
        const product = sku ? productBySku.get(sku) : undefined
        if (!product && sku && (changes.costo_uni === undefined || Number(changes.costo_uni) <= 0)) warnings.push('Si el SKU no existe en el catálogo, completa un costo mayor a 0.')
        if (!product && sku && (changes.precio_venta_1 === undefined || Number(changes.precio_venta_1) <= 0)) warnings.push('Si el SKU no existe en el catálogo, completa P1 mayor a 0.')
        if (!product && sku && (numericDelta ?? 0) < 0) warnings.push('Si el SKU realmente no existe, no puede comenzar con cantidad negativa.')
        parsed.push({ rowNumber: rowIndex + 1, sku, nombre, delta: numericDelta ?? 0, changes, product, errors, warnings })
      }
      if (!parsed.length) throw new Error('La plantilla no contiene filas de productos.')
      if (parsed.length > 500) throw new Error('Esta recepción admite hasta 500 productos por archivo.')
      const duplicates = new Set<string>()
      const seen = new Set<string>()
      for (const row of parsed) {
        if (row.sku && seen.has(row.sku)) duplicates.add(row.sku)
        if (row.sku) seen.add(row.sku)
      }
      if (duplicates.size) {
        for (const row of parsed) if (duplicates.has(row.sku)) row.errors.push(`El SKU ${row.sku} está repetido en el archivo.`)
      }
      setRows(parsed)
      setMessage(`${parsed.length} fila(s) listas para revisar.`)
      // Usa la caché local si existe; no fuerza una actualización del catálogo.
      if (!products.length) {
        const cachedProducts = await fetchAllFirebaseErpProducts(false)
        setProducts(cachedProducts)
        const cachedBySku = new Map(cachedProducts
          .filter(product => !isAppwriteProduct(product) && isMainStoreProduct(product))
          .map(product => [normalizeSku(product.sku), product]))
        setRows(current => current.map(row => {
          const product = cachedBySku.get(row.sku)
          const warnings = row.warnings.filter(warning => !warning.startsWith('Si el SKU'))
          const errors = row.errors.filter(item => item !== 'Un SKU nuevo no puede comenzar con cantidad negativa.')
          if (!product && row.sku && (row.changes.costo_uni === undefined || Number(row.changes.costo_uni) <= 0)) warnings.push('Si el SKU no existe en el catálogo, completa un costo mayor a 0.')
          if (!product && row.sku && (row.changes.precio_venta_1 === undefined || Number(row.changes.precio_venta_1) <= 0)) warnings.push('Si el SKU no existe en el catálogo, completa P1 mayor a 0.')
          if (!product && row.sku && row.delta < 0) warnings.push('Si el SKU realmente no existe, no puede comenzar con una cantidad negativa.')
          return { ...row, product, errors, warnings }
        }))
      }
      setScreen('review')
    } catch (err: any) {
      setError(err?.message || 'No se pudo leer el archivo.')
    } finally {
      setLoadingFile(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const preparePastedRows = async () => {
    setError('')
    setMessage('')
    try {
      const catalog = products.length ? products : await fetchAllFirebaseErpProducts(false)
      if (!products.length) setProducts(catalog)
      const parsed = parsePasteRows(inputText, catalogSkuMap(catalog))
      if (!parsed.length) throw new Error('Pega al menos una fila de productos.')
      if (parsed.length > 500) throw new Error('Esta recepción admite hasta 500 productos por archivo.')
      const prepared = markDuplicateSkus(parsed)
      setRows(prepared)
      setFileName('Recepción por copiar y pegar')
      setReceiptSource('pegado')
      setMessage(`${prepared.length} producto(s) interpretados. Revísalos antes de registrar.`)
      setScreen('review')
    } catch (err: any) {
      setError(err?.message || 'No se pudo interpretar el texto pegado.')
    }
  }

  const prepareAiRows = async () => {
    setLoadingAi(true)
    setError('')
    setMessage('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Inicia sesión para usar el ingreso con IA.')
      const response = await fetch('/api/erp/recepciones', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse-ai', text: inputText }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'La IA no pudo interpretar el texto.')
      const catalog = products.length ? products : await fetchAllFirebaseErpProducts(false)
      if (!products.length) setProducts(catalog)
      const lookup = catalogSkuMap(catalog)
      const parsed = (payload.items || []).map((item: any, index: number) => makePreviewRow(item, index + 1, lookup))
      if (!parsed.length) throw new Error('La IA no encontró productos en el texto. Agrega más detalles y vuelve a intentarlo.')
      const prepared = markDuplicateSkus(parsed)
      setRows(prepared)
      setFileName('Recepción interpretada con IA')
      setReceiptSource('ia')
      setMessage(`La IA interpretó ${prepared.length} producto(s). Corrige lo necesario y confirma la recepción.`)
      setScreen('review')
    } catch (err: any) {
      setError(err?.message || 'No se pudo interpretar el texto con IA.')
    } finally { setLoadingAi(false) }
  }

  const saveReceipt = async () => {
    if (!rows.length || invalidCount || saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Inicia sesión para registrar la recepción.')
      const response = await fetch('/api/erp/recepciones', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sede,
          requestId: crypto.randomUUID(),
          fileName,
          source: receiptSource,
          rows: rows.map(({ sku, nombre, delta, changes, rowNumber, product }) => ({
            sku, nombre, delta, changes, rowNumber,
            ...(product && !isAppwriteProduct(product) ? { productId: product.$id } : {}),
          })),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        if (payload?.receptionId) { clearPosProductsCache(); await loadHistory(); setScreen('history') }
        throw new Error(payload?.error || 'No se pudo registrar la recepción.')
      }
      clearPosProductsCache()
      setMessage(`Recepción registrada: ${payload.processedItems || rows.length} productos procesados.`)
      setRows([])
      setFileName('')
      await loadHistory()
      setScreen('history')
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar la recepción.')
    } finally { setSaving(false) }
  }

  return <div data-pos-page="recepciones" className="w-full min-w-0 space-y-5 px-[3%] pt-5 sm:pt-6 pb-12">
    <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-700"><PackageCheck size={24}/></div>
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Operaciones de inventario</p><h1 className="mt-1 text-2xl font-black tracking-tight text-[#405566]">Recepciones</h1><p className="mt-1 text-sm text-slate-500">Registra y revisa entradas con Excel, pegado de filas o descripción asistida.</p></div>
      </div>
    </header>

    {message && <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><Check size={17}/>{message}</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"><Info size={17} className="mt-0.5 shrink-0"/><span>{error}</span><button onClick={() => setError('')} className="ml-auto text-rose-500"><X size={16}/></button></div>}

    {screen === 'home' && <section className="grid gap-4 lg:grid-cols-2">
      <button onClick={() => { setScreen('history'); loadHistory() }} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-8">
        <div className="flex items-start justify-between gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition group-hover:bg-slate-200"><Clock3 size={27}/></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Últimas 100</span></div>
        <h2 className="mt-5 text-xl font-black text-[#405566]">Ver recepciones</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Consulta quién registró cada ingreso, sus productos, cambios de stock y fecha.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-700">Abrir historial <ArrowDown size={15} className="-rotate-90"/></span>
      </button>
      <button onClick={() => { setScreen('methods'); setMessage(''); setError('') }} className="group rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md sm:p-8">
            <div className="flex items-start justify-between gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#087f73] text-white shadow-sm"><FileSpreadsheet size={27}/></div><span className="rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-bold text-teal-700">3 formas</span></div>
        <h2 className="mt-5 text-xl font-black text-[#405566]">Ingresar recepción</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Elige Excel, copiar y pegar, o describir la recepción con tus propias palabras.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-teal-800">Elegir forma de ingreso <ArrowDown size={15} className="-rotate-90"/></span>
      </button>
    </section>}

    {screen === 'methods' && <section className="space-y-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Nueva recepción</p><h2 className="mt-1 text-xl font-black text-[#405566]">¿Cómo quieres ingresar los productos?</h2><p className="mt-1 text-sm text-slate-500">Los tres métodos llevan a la misma revisión antes de modificar el inventario.</p></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <button onClick={() => { setScreen('import'); setMessage(''); setError('') }} className="group rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><FileSpreadsheet size={23}/></span><h3 className="mt-4 text-lg font-black text-[#405566]">Subir Excel</h3><p className="mt-1 text-sm leading-5 text-slate-600">Descarga la plantilla o carga una ya completada.</p><span className="mt-4 inline-flex rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">Plantilla + archivo</span>
        </button>
        <button onClick={() => { setInputText(''); setScreen('paste'); setMessage(''); setError('') }} className="group rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#087f73] text-white"><ClipboardPaste size={23}/></span><h3 className="mt-4 text-lg font-black text-[#405566]">Copiar y pegar</h3><p className="mt-1 text-sm leading-5 text-slate-600">Pega una o varias filas con el orden indicado.</p><span className="mt-4 inline-flex rounded-lg bg-teal-100 px-3 py-1.5 text-xs font-bold text-teal-800">Formato guiado</span>
        </button>
        <button onClick={() => { setInputText(''); setScreen('ai'); setMessage(''); setError('') }} className="group rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white"><Sparkles size={23}/></span><h3 className="mt-4 text-lg font-black text-[#405566]">Describir con IA</h3><p className="mt-1 text-sm leading-5 text-slate-600">Escribe los datos como te resulte cómodo; luego corrige la tabla.</p><span className="mt-4 inline-flex rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">Revisión obligatoria</span>
        </button>
      </div>
    </section>}

    {screen === 'paste' && <section className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Pegado rápido</p><h2 className="mt-1 text-xl font-black text-[#405566]">Pega una fila por producto</h2>
        <p className="mt-2 text-sm text-slate-600">Una fila por producto. Primero van los datos importantes; código de barra y precios secundarios van después de la cantidad.</p>
        <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-teal-800">Formato y ejemplos</p><div className="flex flex-wrap gap-2"><button onClick={() => copyPasteText(pasteHeader, 'Formato')} className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-teal-800">Copiar formato</button><button onClick={() => copyPasteText(pasteExample, 'Ejemplo simple')} className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-teal-800">Copiar ejemplo simple</button><button onClick={() => copyPasteText(pasteSkipBarcodeExample, 'Ejemplo sin código')} className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-teal-800">Copiar sin código</button></div></div><code className="mt-3 block overflow-x-auto whitespace-nowrap text-[11px] text-slate-600">{pasteHeader}</code><p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Lo básico</p><code className="mt-1 block overflow-x-auto whitespace-nowrap text-xs text-slate-800">{pasteExample}</code><p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Con código de barra y P2–P4</p><code className="mt-1 block overflow-x-auto whitespace-nowrap text-xs text-slate-800">{pasteFullExample}</code><p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Sin código de barra, con P2–P4</p><code className="mt-1 block overflow-x-auto whitespace-nowrap text-xs text-slate-800">{pasteSkipBarcodeExample}</code><p className="mt-2 text-xs leading-5 text-slate-600"><strong>--</strong> deja vacío el espacio del código de barra. Así puedes indicar P2, P3 y P4 después. En un producto nuevo, incluye costo y P1.</p></div>
        <textarea value={inputText} onChange={event => setInputText(event.target.value)} rows={9} placeholder={'P10-TAZA DE X-300-500-10\nP10-TAZA DE X-300-500-10-7801234567890-600-700-800\nP10-TAZA DE X-300-500-10--600-700-800'} className="mt-4 w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
        <button onClick={preparePastedRows} disabled={!inputText.trim()} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"><ClipboardPaste size={16}/> Revisar productos</button>
      </div>
    </section>}

    {screen === 'ai' && <section className="space-y-4">
      <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Recepción asistida</p><h2 className="mt-1 text-xl font-black text-[#405566]">Describe los productos como te salga más fácil</h2>
        <p className="mt-2 text-sm text-slate-600">La IA ordenará lo que escribas en una tabla. Solo usará los datos explícitos; podrás corregirlos antes de confirmar.</p>
        <textarea value={inputText} onChange={event => setInputText(event.target.value)} rows={8} placeholder={'Caja de zapatos SKU P10: costo 200 pesos, precio 400, segundo precio 500, ingresaron 50 unidades.\nProducto DB-ABC: Taza rosca, costo 300, P1 600, subí 24 unidades.'} className="mt-4 w-full rounded-2xl border border-amber-200 bg-white p-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Si no mencionas una cantidad, el stock queda igual. Para crear un producto nuevo, incluye su SKU, nombre, costo y P1. No se guarda nada sin tu confirmación.</p><button onClick={prepareAiRows} disabled={!inputText.trim() || loadingAi} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300">{loadingAi ? <RefreshCw size={16} className="animate-spin"/> : <Sparkles size={16}/>} {loadingAi ? 'Interpretando…' : 'Interpretar con IA'}</button></div>
      </div>
    </section>}

    {screen === 'import' && <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Paso 1 · Planilla</p><h2 className="mt-1 text-xl font-black text-[#405566]">Carga los productos recibidos</h2><p className="mt-1 text-sm text-slate-500">Cada fila se identifica por SKU. Puedes corregir información y sumar o restar unidades.</p></div>
            <button onClick={() => downloadTemplate().catch(err => setError(err?.message || 'No se pudo crear la plantilla.'))} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-800 hover:bg-teal-100"><Download size={16}/> Descargar plantilla</button>
          </div>
          <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={event => selectFile(event.target.files?.[0])}/>
          <button onClick={() => fileInput.current?.click()} disabled={loadingFile} className="mt-5 flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/60 px-4 py-6 text-center transition hover:border-teal-400 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-70">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm">{loadingFile ? <RefreshCw size={22} className="animate-spin"/> : <Upload size={22}/>}</span>
            <span className="mt-3 text-sm font-bold text-slate-800">{loadingFile ? 'Leyendo planilla…' : 'Seleccionar archivo Excel'}</span>
            <span className="mt-1 text-xs text-slate-500">Formato .xlsx · máximo 500 productos por archivo</span>
          </button>
          {fileName && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600"><FileSpreadsheet size={15} className="text-emerald-700"/>{fileName}</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800"><strong>Rojo:</strong> SKU, nombre y cantidad. Costo y P1 cuando el SKU sea nuevo.</div>
            <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><strong>Verde:</strong> datos opcionales. Si se dejan vacíos, no se borran los actuales.</div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><strong>Cantidad:</strong> positiva ingresa, negativa resta. Si existe deuda previa, el ingreso la compensa primero.</div>
          </div>
        </div>
        <aside className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-sm font-bold text-teal-200"><Info size={16}/> Cómo se aplica</div>
          <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-200">
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500 text-xs font-black text-white">1</span><span>El SKU busca el producto existente. Si no existe, se crea desde esa fila.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500 text-xs font-black text-white">2</span><span>Los campos no vacíos actualizan el producto; los vacíos conservan su información.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500 text-xs font-black text-white">3</span><span>Antes de guardar podrás revisar la cantidad ingresada y el stock final por SKU.</span></li>
          </ol>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-300">Ejemplo</p><p className="mt-2 text-sm text-slate-200">Stock 20 <span className="text-emerald-300">+ 21</span> = <strong className="text-white">41</strong></p><p className="mt-1 text-sm text-slate-200">Stock 20 <span className="text-rose-300">− 21</span> = <strong className="text-white">0</strong></p></div>
        </aside>
      </div>

    </section>}

    {screen === 'review' && <section className="space-y-4">
      {rows.length > 0 && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Filas en la recepción</p><p className="mt-1 text-2xl font-black text-[#405566]">{rows.length}</p></div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4"><p className="text-xs font-semibold text-teal-700">Sin / con coincidencia en caché</p><p className="mt-1 text-2xl font-black text-teal-900">{newCount} <span className="text-base font-semibold text-slate-400">/</span> {updateCount}</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">Unidades que entran</p><p className="mt-1 text-2xl font-black text-emerald-900">+{fmtQty(addedUnits)}</p></div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><p className="text-xs font-semibold text-rose-700">Unidades que salen</p><p className="mt-1 text-2xl font-black text-rose-900">−{fmtQty(removedUnits)}</p></div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5"><div><h3 className="font-black text-[#405566]">Revisar productos</h3><p className="mt-0.5 text-xs text-slate-500">Los datos se guardan solo después de confirmar.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${invalidCount ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{invalidCount ? `${invalidCount} problema(s)` : 'Listo para revisar'}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Producto / SKU</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Stock actual</th><th className="px-4 py-3 text-right">Cambio</th><th className="px-4 py-3 text-right">Stock final</th><th className="px-4 py-3">Datos por actualizar</th><th className="px-4 py-3">Revisión</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => {
                  const current = row.product?.stock || 0
                  const ending = row.delta > 0 ? current + row.delta : Math.max(0, current + row.delta)
                  const fieldsCount = Object.keys(row.changes).length + (row.product && row.nombre !== row.product.nombre ? 1 : 0)
                  return <React.Fragment key={`${row.rowNumber}-${row.sku}`}><tr className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3"><p className="max-w-[320px] truncate font-bold text-[#405566]">{row.nombre || 'Sin nombre'}</p><p className="mt-1 font-mono text-xs text-slate-500">{row.sku || 'Sin SKU'} · fila {row.rowNumber}</p><button onClick={() => setEditingRow(editingRow === row.rowNumber ? null : row.rowNumber)} className="mt-2 text-xs font-bold text-teal-700 hover:text-teal-900">{editingRow === row.rowNumber ? 'Cerrar edición' : 'Editar datos'}</button></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.product ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'}`}>{row.product ? 'Coincidencia en caché' : 'Se verificará por SKU'}</span></td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{row.product ? fmtQty(current) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-black ${row.delta > 0 ? 'text-emerald-700' : row.delta < 0 ? 'text-rose-700' : 'text-slate-500'}`}>{row.delta > 0 ? '+' : ''}{fmtQty(row.delta)}</td>
                    <td className="px-4 py-3 text-right font-black text-[#405566]">{row.product ? fmtQty(ending) : row.delta >= 0 ? fmtQty(row.delta) : '0'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fieldsCount ? `${fieldsCount} campo(s)` : 'Solo stock'}{row.warnings.length > 0 && <p className="mt-1 max-w-[220px] text-amber-700">Revisa datos requeridos si el SKU es nuevo.</p>}</td>
                    <td className="px-4 py-3">{row.errors.length ? <ul className="space-y-1 text-xs font-medium text-rose-700">{row.errors.map((item, index) => <li key={index}>{item}</li>)}</ul> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={14}/> Correcto</span>}</td>
                  </tr>{editingRow === row.rowNumber && <tr className="bg-teal-50/60"><td colSpan={7} className="px-4 pb-4"><div className="grid gap-3 rounded-2xl border border-teal-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-600">SKU<input value={row.sku} onChange={event => updateEditedRow(row.rowNumber, 'sku', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-teal-400"/></label>
                    <label className="text-xs font-semibold text-slate-600">Nombre<input value={row.nombre} onChange={event => updateEditedRow(row.rowNumber, 'nombre', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-400"/></label>
                    <label className="text-xs font-semibold text-slate-600">Cantidad (+ entra / − sale)<input type="number" value={row.noQuantity ? '' : row.delta} onChange={event => updateEditedRow(row.rowNumber, 'delta', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-400"/></label>
                    <label className="text-xs font-semibold text-slate-600">Código de barra<input value={String(row.changes.codigo_barra ?? '')} onChange={event => updateEditedRow(row.rowNumber, 'codigo_barra', event.target.value)} placeholder="Sin cambio" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-400"/></label>
                    {(['costo_uni', 'precio_venta_1', 'precio_venta_2', 'precio_venta_3', 'precio_venta_4'] as FieldKey[]).map((field, index) => <label key={field} className="text-xs font-semibold text-slate-600">{['Costo', 'P1', 'P2', 'P3', 'P4'][index]}<input type="number" value={String(row.changes[field] ?? '')} onChange={event => updateEditedRow(row.rowNumber, field, event.target.value)} placeholder="Sin cambio" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-400"/></label>)}
                    <details className="sm:col-span-2 lg:col-span-4"><summary className="cursor-pointer text-xs font-bold text-teal-800">Más datos opcionales</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {(['category', 'subcategory', 'proveedor', 'cantidad_embalaje', 'box_code', 'label_p2', 'label_p3', 'min_qty_2', 'min_qty_3', 'description', 'imageUrl'] as FieldKey[]).map(field => <label key={field} className="text-xs font-semibold text-slate-600">{field.replace(/_/g, ' ')}<input value={String(row.changes[field] ?? '')} onChange={event => updateEditedRow(row.rowNumber, field, event.target.value)} placeholder="Sin cambio" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-400"/></label>)}
                    </div></details>
                    <p className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500">Deja un campo opcional vacío para conservar el dato que ya tiene el producto.</p>
                  </div></td></tr>}</React.Fragment>
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs leading-5 text-slate-500">Se registrará el movimiento de stock y quedará asociado al historial de recepciones.</p>
            <button onClick={saveReceipt} disabled={saving || invalidCount > 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? <RefreshCw size={16} className="animate-spin"/> : <Check size={16}/>} {saving ? 'Registrando…' : 'Confirmar recepción'}</button>
          </div>
        </div>
      </>}
    </section>}

    {screen === 'history' && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Registro de inventario</p><h2 className="mt-1 text-xl font-black text-[#405566]">Historial de recepciones</h2><p className="mt-1 text-sm text-slate-500">Cada registro incluye el origen, responsable y detalle por producto.</p></div><button onClick={loadHistory} disabled={loadingHistory} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={15} className={loadingHistory ? 'animate-spin' : ''}/> Actualizar</button></div>
      {loadingHistory && records.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Cargando recepciones…</div>}
      {!loadingHistory && records.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Boxes size={23}/></div><h3 className="mt-3 font-bold text-slate-800">Todavía no hay recepciones</h3><p className="mt-1 text-sm text-slate-500">Cuando confirmes una recepción, aparecerá aquí.</p><button onClick={() => setScreen('methods')} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800"><Plus size={15}/> Ingresar recepción</button></div>}
      <div className="space-y-3">{records.map(record => {
        const id = String(record.receptionId || '')
        const expanded = expandedId === id
        const items = Array.isArray(record.items) ? record.items : []
        const statusStyle = record.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : record.status === 'processing' ? 'bg-teal-100 text-teal-800' : record.status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
        return <article key={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button onClick={() => setExpandedId(expanded ? '' : id)} className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileSpreadsheet size={19}/></div><div className="min-w-0"><p className="truncate font-bold text-[#405566]">{record.fileName || 'Recepción de inventario'}</p><p className="mt-1 text-xs text-slate-500">{formatDate(timestamp(record))} · {record.createdByName || record.createdBy || 'Usuario'}</p></div></div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle}`}>{record.status === 'completed' ? 'Completada' : record.status === 'processing' ? 'Procesando' : record.status === 'partial' ? 'Parcial' : 'Revisar'}</span><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{record.processedItems || 0}/{record.totalItems || 0} productos</span><span className="text-xs font-bold text-emerald-700">+{fmtQty(record.totalAdded || 0)}</span><span className="text-xs font-bold text-rose-700">−{fmtQty(record.totalRemoved || 0)}</span><ChevronDown size={17} className={`text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}/></div>
          </button>
          {expanded && <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5"><div className="mb-3 grid gap-2 text-xs sm:grid-cols-3"><p className="rounded-xl bg-white p-3 text-slate-600">Creados: <strong className="text-[#405566]">{record.createdProducts || 0}</strong></p><p className="rounded-xl bg-white p-3 text-slate-600">Actualizados: <strong className="text-[#405566]">{record.updatedProducts || 0}</strong></p><p className="rounded-xl bg-white p-3 text-slate-600">Sucursal: <strong className="text-[#405566]">{record.sede || sede}</strong></p></div>
            {record.error && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{record.error}</p>}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[660px] text-left text-xs"><thead className="bg-slate-50 uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">SKU</th><th className="px-3 py-2.5">Producto</th><th className="px-3 py-2.5 text-right">Antes</th><th className="px-3 py-2.5 text-right">Cambio</th><th className="px-3 py-2.5 text-right">Después</th><th className="px-3 py-2.5">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item: any, index: number) => <tr key={`${item.sku}-${index}`}><td className="px-3 py-2.5 font-mono font-semibold text-slate-600">{item.sku}</td><td className="max-w-[260px] truncate px-3 py-2.5 font-semibold text-slate-800">{item.nombre}</td><td className="px-3 py-2.5 text-right text-slate-600">{fmtQty(item.stockAnterior)}</td><td className={`px-3 py-2.5 text-right font-bold ${item.delta > 0 ? 'text-emerald-700' : item.delta < 0 ? 'text-rose-700' : 'text-slate-500'}`}>{item.delta > 0 ? '+' : ''}{fmtQty(item.delta)}</td><td className="px-3 py-2.5 text-right font-bold text-[#405566]">{fmtQty(item.stockNuevo)}</td><td className="px-3 py-2.5 text-slate-600"><span>{item.action === 'creado' ? 'Producto creado' : item.action === 'actualizado' ? 'Producto actualizado' : 'En proceso'}</span>{Array.isArray(item.changedFields) && item.changedFields.length > 0 && <p className="mt-1 max-w-[260px] text-[10px] text-slate-400">Campos: {item.changedFields.map((field: string) => field.replace(/_/g, ' ')).join(', ')}</p>}</td></tr>)}</tbody></table></div>
          </div>}
        </article>
      })}</div>
    </section>}
  </div>
}
