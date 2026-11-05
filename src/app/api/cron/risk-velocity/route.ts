/**
 * Cron: Cálculo de salesVelocity7d para todos los productos.
 *
 * Acordado con Gravity:
 * - Lee ventas_pos de los últimos 7 días (excluye ventas mayoristas)
 * - Calcula promedio recortado (winsorized) por SKU
 * - Guarda salesVelocity7d solo en los documentos de producto cuyo valor cambió
 * - Llamar a las 03:00 AM: GET /api/cron/risk-velocity?secret=CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getAdminDb } from '@/lib/db-server'
import { scanAndNotifyRedProducts } from '@/lib/stock-risk-alerts'
import { STOCK_CRITICAL_ALERTS_ENABLED } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60s timeout en Vercel Hobby (Fluid Compute)

const CRON_SECRET = process.env.CRON_SECRET || 'expire_orders_secret_2026'

export async function GET(req: NextRequest) {
  try {
    // Vercel Cron envía Authorization: Bearer <CRON_SECRET>
    // Tests manuales usan ?secret=<CRON_SECRET>
    const authHeader = req.headers.get('authorization')
    const { searchParams } = new URL(req.url)
    const querySecret = searchParams.get('secret')
    const isAuthorized =
      (authHeader && authHeader === `Bearer ${CRON_SECRET}`) ||
      querySecret === CRON_SECRET
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminDb = getAdminDb()

    // Reset de alertas si se pasa ?resetAlerts=true (para reenviar alertas tras configurar WhatsApp)
    if (searchParams.get('resetAlerts') === 'true') {
      const productsSnap = await adminDb.collection('products').get()
      const resetBatch = adminDb.batch()
      let resetCount = 0
      productsSnap.forEach((doc: any) => {
        if (doc.data()?.lastRedAlertAt) {
          resetBatch.update(doc.ref, { lastRedAlertAt: null })
          resetCount++
        }
      })
      if (resetCount > 0) await resetBatch.commit()
      console.log(`[cron/risk-velocity] Reset de ${resetCount} alertas`)
    }

    // 1. Leer solo ventas completadas de los últimos 7 días. El índice
    //    compuesto evita descargar preventas y ventas anuladas para filtrarlas
    //    después en Node.
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sinceStr = sevenDaysAgo.toISOString().slice(0, 10)

    let ventasSnap: any
    try {
      ventasSnap = await adminDb.collection('ventas_pos')
        .where('estado', '==', 'completada')
        .where('fechaStr', '>=', sinceStr)
        .get()
    } catch (indexError) {
      console.warn('[cron/risk-velocity] Índice estado+fechaStr pendiente; usando consulta anterior temporalmente:', indexError)
      ventasSnap = await adminDb.collection('ventas_pos')
        .where('fechaStr', '>=', sinceStr)
        .get()
    }

    // 2. Acumular unidades vendidas por SKU+fecha (excluyendo mayoristas)
    //     y rastrear el tamaño máximo de lote por SKU (cuánto compra un cliente de una vez)
    const skuFechaCantidad = new Map<string, number>() // "sku|fecha" -> cantidad_total
    const skuMaxBatch = new Map<string, number>() // sku -> cantidad máxima en una sola venta
    ventasSnap.forEach((doc: any) => {
      const data = doc.data()
      // Mantener el filtro como defensa para registros malformados y el fallback.
      if (String(data.estado || '') !== 'completada') return
      const fechaStr = String(data.fechaStr || '')
      // Los items se guardan como itemsJson (string JSON serializado)
      let items: any[] = []
      try { items = JSON.parse(data.itemsJson || '[]') } catch {}
      if (!Array.isArray(items) || items.length === 0) return
      const modoVenta = String(data.modoVenta || '').toLowerCase()

      if (modoVenta.includes('mayor') || modoVenta.includes('bulto')) return

      items.forEach((item: any) => {
        const sku = String(item.SKU || item.sku || item.codigo || '').trim().toUpperCase()
        if (!sku) return
        const cantidad = Number(item.cantidad || item.CANTIDAD || item.qty || 1)
        const key = `${sku}|${fechaStr}`
        skuFechaCantidad.set(key, (skuFechaCantidad.get(key) || 0) + cantidad)
        // Rastrear el lote máximo (sin contar ventas atípicas >100 que probablemente son mayoristas)
        if (cantidad <= 100) {
          const currentMax = skuMaxBatch.get(sku) || 0
          if (cantidad > currentMax) skuMaxBatch.set(sku, cantidad)
        }
      })
    })

    // 3. Calcular promedio recortado (winsorized) por SKU
    const skuVelocity = new Map<string, number>()

    // Agrupar por SKU
    const skuFechas = new Map<string, Map<string, number>>() // sku -> fecha -> cantidad
    for (const [key, cant] of skuFechaCantidad) {
      const [sku, fecha] = key.split('|')
      if (!skuFechas.has(sku)) skuFechas.set(sku, new Map())
      skuFechas.get(sku)!.set(fecha, cant)
    }

    for (const [sku, fechaMap] of skuFechas) {
      const dailyTotals = Array.from(fechaMap.values()) // [cant_dia1, cant_dia2, ...]

      // Winsorized mean: si el día con más ventas representa >50% del total,
      // recortarlo al doble del promedio de los otros días
      const total = dailyTotals.reduce((a, b) => a + b, 0)
      const maxDay = Math.max(...dailyTotals)
      const otherDaysAvg = dailyTotals.length > 1
        ? (total - maxDay) / (dailyTotals.length - 1)
        : maxDay

      let adjustedTotals = dailyTotals
      if (dailyTotals.length > 1 && maxDay > total * 0.5) {
        const cap = otherDaysAvg * 2
        adjustedTotals = dailyTotals.map(v => v > cap ? cap : v)
      }
      // Edge case: 1 solo día de venta en la semana
      // NO topar a 5 (eso daba velocity=0.71 para todos).
      // En su lugar, topar a un máximo de 50 unidades/día para evitar
      // que una compra mayorista atípica distorsione la velocity.
      if (dailyTotals.length === 1 && maxDay > 50) {
        adjustedTotals = [50]
      }

      // Promedio sobre 7 días (incluir días con 0 ventas)
      const sumAdjusted = adjustedTotals.reduce((a, b) => a + b, 0)
      const velocity7d = sumAdjusted / 7
      skuVelocity.set(sku, Math.round(velocity7d * 100) / 100)
    }

    // 4. Batch write SOLO a los productos cuyo salesVelocity7d o maxBatchSize cambió
    //    (Ahorra ~90% de escrituras diarias y evita romper el límite de 500 ops por batch)
    const productsSnap = await adminDb.collection('products').get()
    const pendingUpdates: Array<{ ref: any; velocity: number; maxBatch: number }> = []
    const nowIso = new Date().toISOString()

    productsSnap.forEach((doc: any) => {
      const data = doc.data()
      const sku = String(data.SKU || data.sku || '').trim().toUpperCase()
      if (!sku) return

      const velocity = skuVelocity.get(sku) || 0
      const maxBatch = skuMaxBatch.get(sku) || 1
      const prevVelocity = Number(data.salesVelocity7d ?? 0)
      const prevMaxBatch = Number(data.maxBatchSize ?? 1)

      if (prevVelocity !== velocity || prevMaxBatch !== maxBatch) {
        pendingUpdates.push({ ref: doc.ref, velocity, maxBatch })
      }
    })

    let updated = 0
    const CHUNK_SIZE = 450
    for (let i = 0; i < pendingUpdates.length; i += CHUNK_SIZE) {
      const chunk = pendingUpdates.slice(i, i + CHUNK_SIZE)
      const batch = adminDb.batch()
      for (const item of chunk) {
        batch.update(item.ref, {
          salesVelocity7d: item.velocity,
          maxBatchSize: item.maxBatch,
          salesVelocityUpdatedAt: nowIso,
        })
        updated++
      }
      await batch.commit()
    }

    // Invalidar caché de productos solo si hubo cambios reales
    if (updated > 0) {
      try { revalidateTag('products'); } catch {}
    }

    // 5. Disparar alertas de productos que cayeron en rojo (si están habilitadas)
    let alertsResult: { alerted: number; skipped: number } | null = null
    if (STOCK_CRITICAL_ALERTS_ENABLED) {
      try {
        alertsResult = await scanAndNotifyRedProducts()
      } catch (e) {
        console.warn('[cron/risk-velocity] Alertas fallaron:', e)
      }
    } else {
      alertsResult = { alerted: 0, skipped: 0 }
    }

    return NextResponse.json({
      ok: true,
      updated,
      unchanged: productsSnap.size - updated,
      skusWithSales: skuVelocity.size,
      alerts: alertsResult,
      calculatedAt: nowIso,
    })
  } catch (e: any) {
    console.error('[cron/risk-velocity] Error:', e)
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
