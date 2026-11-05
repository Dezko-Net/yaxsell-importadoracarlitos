/**
 * stock-risk-alerts.ts — Notificaciones al bodeguero cuando un producto cae en rojo.
 *
 * Acordado con Gravity:
 * - Edge-trigger: solo notificar en la transición (verde/amarillo → rojo)
 * - Debounce de 4 horas: si ya se notificó en las últimas 4h, no spamear
 * - Campo lastRedAlertAt en el documento del producto
 */

import { getAdminDb } from '@/lib/db-server'
import { notifyAdmin } from '@/lib/notify-admin'
import { sendWhatsAppMessage, sendWhatsAppTemplate, formatWhatsAppPhone } from '@/lib/whatsapp'
import { STOCK_CRITICAL_ALERTS_ENABLED } from '@/lib/feature-flags'

const DEBOUNCE_MS = 4 * 60 * 60 * 1000 // 4 horas

/**
 * Verifica si estamos dentro del horario permitido para notificar (09:00-20:00 Chile).
 * Si estamos fuera de horario, las alertas se guardan pero no se envían por WhatsApp.
 */
function isWithinAlertHours(): boolean {
  // Hora de Chile (UTC-3)
  const now = new Date()
  const chileHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    hour: 'numeric',
    hour12: false,
  }).format(now))
  return chileHour >= 9 && chileHour < 20
}

/**
 * Envía alerta WhatsApp al bodeguero usando plantilla aprobada.
 * Usa BODEGUERO_WHATSAPP_NUMBER si está configurado, sino cae a notifyAdmin.
 * Usa plantilla alerta_stock_critico para funcionar fuera de la ventana de 24h.
 */
async function notifyBodeguero(
  productName: string,
  riskPct: number,
  stock: number,
  velocity: number,
): Promise<void> {
  // Si las alertas están desactivadas en feature-flags, salir inmediatamente
  if (!STOCK_CRITICAL_ALERTS_ENABLED) return

  // Solo enviar WhatsApp entre 09:00 y 20:00 hora de Chile
  if (!isWithinAlertHours()) {
    console.log(`[stock-risk-alerts] Fuera de horario (09-20 Chile), no se envía WhatsApp para ${productName}`)
    return
  }

  const bodegueroPhone = process.env.BODEGUERO_WHATSAPP_NUMBER
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN || ''
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
  const velocityRounded = Math.round(velocity)

  if (bodegueroPhone && waToken) {
    try {
      const formatted = formatWhatsAppPhone(bodegueroPhone)
      try {
        // Intentar con plantilla aprobada (funciona fuera de ventana 24h)
        await sendWhatsAppTemplate(
          formatted,
          'alerta_stock_critico',
          'es_CL',
          [{
            type: 'body',
            parameters: [
              { type: 'text', text: productName },
              { type: 'text', text: String(riskPct) },
              { type: 'text', text: String(stock) },
              { type: 'text', text: String(velocityRounded) },
            ],
          }],
          waToken,
        )
        return
      } catch (tplErr: any) {
        console.warn('[stock-risk-alerts] Plantilla falló, fallback a texto libre:', tplErr?.message || tplErr)
        // Fallback a texto libre (solo funciona dentro de ventana 24h)
        const msg = `🚨 ALERTA DE STOCK CRÍTICO - Importadora Carlitos\n\nProducto: ${productName}\nSalud de Stock: ${riskPct}% 🔴 (Crítico/Casi vacío)\nStock actual: ${stock} unidades\nSe vende aprox. ${velocityRounded} unidades por día en tienda\n\n⚠️ Este producto está publicado en la web pero se agota rápido en tienda. Repón el stock o avisa para despublicarlo de la web.`
        await sendWhatsAppMessage(formatted, msg, waToken)
        return
      }
    } catch (e) {
      console.warn('[stock-risk-alerts] WhatsApp directo falló, fallback a notifyAdmin:', e)
    }
  }

  // Fallback: usar notifyAdmin (envía al adminAlertPhone configurado)
  const msg = `🚨 ALERTA DE STOCK - ${productName}\nSalud de stock: ${riskPct}% 🔴 (Crítico)\nStock: ${stock}u\nVelocidad: ${velocityRounded}u/día`
  await notifyAdmin(msg)
}

/**
 * Verifica si un producto que acaba de cambiar de stock debe disparar
 * alerta al bodeguero (transición a rojo con debounce).
 *
 * Llamar después de cada venta del POS o después del cron nocturno.
 */
export async function checkAndNotifyRedTransition(
  productId: string,
  productName: string,
  stock: number,
  salesVelocity7d: number,
): Promise<void> {
  if (!STOCK_CRITICAL_ALERTS_ENABLED) return

  try {
    const adminDb = getAdminDb()
    const productRef = adminDb.collection('products').doc(productId)
    const snap = await productRef.get()
    if (!snap.exists) return

    const data = snap.data() || {}
    const lastRedAlertAt = data.lastRedAlertAt
      ? new Date(data.lastRedAlertAt).getTime()
      : 0

    // Debounce: si ya se notificó en las últimas 4h, no spamear
    const now = Date.now()
    if (now - lastRedAlertAt < DEBOUNCE_MS) return

    // Calcular riesgo actual
    const { getProductRisk } = await import('@/lib/stock-risk')
    const risk = getProductRisk({
      stock,
      salesVelocity7d: salesVelocity7d || data.salesVelocity7d || 0,
      maxBatchSize: Number(data.maxBatchSize) || 1,
      daysSinceCreated: data.createdAt
        ? Math.floor((now - new Date(data.createdAt).getTime()) / 86400000)
        : 999,
      price: Number(data.CURRENTPRICE ?? data.PRICE ?? data.precio_venta_1 ?? 0),
    })

    if (risk.level !== 'rojo') return

    // Notificar al bodeguero
    await notifyBodeguero(productName, risk.pct, stock, salesVelocity7d || data.salesVelocity7d || 0)

    // Marcar timestamp de última alerta
    await productRef.update({
      lastRedAlertAt: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[stock-risk-alerts] Error:', e)
  }
}

/**
 * Escanea todos los productos y dispara alertas para los que caen en rojo.
 * Llamar desde un cron o después del cron de velocity.
 */
export async function scanAndNotifyRedProducts(): Promise<{ alerted: number; skipped: number }> {
  if (!STOCK_CRITICAL_ALERTS_ENABLED) {
    return { alerted: 0, skipped: 0 }
  }

  try {
    const adminDb = getAdminDb()
    const { getProductRisk } = await import('@/lib/stock-risk')

    const productsSnap = await adminDb.collection('products').get()
    const now = Date.now()
    let alerted = 0
    let skipped = 0

    for (const doc of productsSnap.docs) {
      const data = doc.data() || {}
      // Solo alertar productos que están publicados en la web
      const isPublished = Boolean(data.SHOW_IN_WEB ?? data.show_in_web)
      if (!isPublished) continue

      const stock = Number(data.STOCK ?? data.stock ?? 0)
      const velocity = Number(data.salesVelocity7d) || 0
      const lastRedAlertAt = data.lastRedAlertAt
        ? new Date(data.lastRedAlertAt).getTime()
        : 0

      // Debounce
      if (now - lastRedAlertAt < DEBOUNCE_MS) {
        skipped++
        continue
      }

      const risk = getProductRisk({
        stock,
        salesVelocity7d: velocity,
        maxBatchSize: Number(data.maxBatchSize) || 1,
        daysSinceCreated: data.createdAt
          ? Math.floor((now - new Date(data.createdAt).getTime()) / 86400000)
          : 999,
        price: Number(data.CURRENTPRICE ?? data.PRICE ?? data.precio_venta_1 ?? 0),
      })

      if (risk.level !== 'rojo') continue

      const name = String(data.NAME || data.nombre || data.sku || doc.id)

      try {
        await notifyBodeguero(name, risk.pct, stock, velocity)
        await doc.ref.update({ lastRedAlertAt: new Date().toISOString() })
        alerted++
      } catch (e) {
        console.warn(`[stock-risk-alerts] Error notifying ${doc.id}:`, e)
      }
    }

    return { alerted, skipped }
  } catch (e) {
    console.error('[stock-risk-alerts] scanAndNotifyRedProducts error:', e)
    return { alerted: 0, skipped: 0 }
  }
}
