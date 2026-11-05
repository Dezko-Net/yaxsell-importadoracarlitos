/**
 * Horario de Atención y Ventana de Pago para Importadora Carlitos
 *
 * Horario de Tienda (Hora de Chile / America/Santiago):
 * - Lunes a Viernes: 09:00 a 18:00 CLT
 * - Sábado: 09:00 a 15:00 CLT
 * - Domingo: 10:00 a 15:00 CLT
 *
 * Reglas de Expiración (Pedidos Pendientes de Pago):
 * 1. Fuera de Horario:
 *    - No corre cronómetro ni expira el pedido ("sin cronómetro").
 *    - La UI muestra el estado pausado indicando la hora de apertura.
 * 2. Al abrir la tienda:
 *    - Los pedidos recibidos fuera de horario tienen exactamente 20 minutos desde la apertura para pagar.
 * 3. Dentro del horario:
 *    - Los pedidos tienen 20 minutos desde su creación o reactivación para pagar.
 *    - Si no pagan en 20 minutos dentro de horario de tienda, el pedido expira.
 * 4. Pago vencido:
 *    - Se puede subir el comprobante hasta que se cumplan 24 horas desde la creación del pedido.
 */

import { getOrderAutoCancelDeadline, ORDER_AUTO_CANCEL_WINDOW_MS } from '@/lib/order-expiration';

export const PAYMENT_WINDOW_MS = 20 * 60 * 1000; // 20 minutos

export interface ChileTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
}

export function getChileParts(date: Date = new Date()): ChileTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) {
    m[p.type] = p.value;
  }

  const hour = (parseInt(m.hour, 10) || 0) % 24;
  const minute = parseInt(m.minute, 10) || 0;
  const second = parseInt(m.second, 10) || 0;
  const day = parseInt(m.day, 10) || 1;
  const month = parseInt(m.month, 10) || 1;
  const year = parseInt(m.year, 10) || 2026;
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = days[m.weekday || ''] ?? date.getDay();

  return { year, month, day, hour, minute, second, dayOfWeek };
}

export interface StoreScheduleInfo {
  isOpen: boolean;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
  openH: number;
  closeH: number;
  todayOpenMs: number;
  todayCloseMs: number;
  nextOpenStr: string;
}

export function getStoreSchedule(nowDate: Date = new Date()): StoreScheduleInfo {
  const parts = getChileParts(nowDate);
  const { hour, minute, second, dayOfWeek } = parts;

  // Lunes a Viernes: 09:00 a 18:00
  // Sábado: 09:00 a 15:00
  // Domingo: 10:00 a 15:00
  let openH = 9;
  let closeH = 18;
  if (dayOfWeek === 0) {
    openH = 10;
    closeH = 15;
  } else if (dayOfWeek === 6) {
    openH = 9;
    closeH = 15;
  }

  const curSecs = hour * 3600 + minute * 60 + second;
  const openSecs = openH * 3600;
  const closeSecs = closeH * 3600;

  const isOpen = curSecs >= openSecs && curSecs < closeSecs;

  const nowMs = nowDate.getTime();
  const todayOpenMs = nowMs - (curSecs - openSecs) * 1000;
  const todayCloseMs = nowMs - (curSecs - closeSecs) * 1000;

  let nextOpenStr = '09:00';
  if (dayOfWeek === 6 && curSecs >= closeSecs) {
    nextOpenStr = 'Dom 10:00';
  } else if (dayOfWeek === 0 && curSecs < openSecs) {
    nextOpenStr = '10:00';
  } else if (dayOfWeek === 0 && curSecs >= closeSecs) {
    nextOpenStr = 'Lun 09:00';
  }

  return {
    isOpen,
    hour,
    minute,
    second,
    dayOfWeek,
    openH,
    closeH,
    todayOpenMs,
    todayCloseMs,
    nextOpenStr,
  };
}

export interface OrderWindowResult {
  isOpen: boolean;
  isPaused: boolean;
  isExpired: boolean;
  level: 'verde' | 'amarillo' | 'rojo' | 'pausado';
  remainingPct: number;
  remainingText: string;
  badgeText: string;
  deadlineMs: number;
}

export function evaluateOrderWindow(
  order: {
    CREATEDAT?: any;
    UPDATEDAT?: any;
    EXPIRESAT?: any;
    PAYMENTEXPIREDAT?: any;
    AUTOCANCELAT?: any;
    EXPIRATIONWINDOWMINUTES?: any;
    STATUS?: any;
    $createdAt?: any;
  },
  nowMs: number = Date.now()
): OrderWindowResult {
  const schedule = getStoreSchedule(new Date(nowMs));
  const isPaymentExpired = String(order.STATUS || '') === 'payment_expired';
  const autoCancelAt = getOrderAutoCancelDeadline(order);

  // 1. Tienda cerrada (fuera de horario)
  // El límite de 24 horas desde la creación sí corre en tiempo real.
  if (!schedule.isOpen && !isPaymentExpired) {
    return {
      isOpen: false,
      isPaused: true,
      isExpired: false,
      level: 'pausado',
      remainingPct: 100,
      remainingText: 'Fuera de horario',
      badgeText: `🌙 Pausado (Abre ${schedule.nextOpenStr})`,
      deadlineMs: 0,
    };
  }

  // 2. Tienda abierta
  const rawCreated = order.CREATEDAT || order.$createdAt;
  const createdAtMs = rawCreated ? new Date(rawCreated).getTime() : nowMs;
  const updatedAtMs = order.UPDATEDAT ? Number(order.UPDATEDAT) : 0;
  // Momento base: si se reactivó recientemente hoy, usamos updatedAtMs; sino createdAtMs
  const effectiveBaseTime = updatedAtMs && updatedAtMs > createdAtMs && updatedAtMs >= schedule.todayOpenMs
    ? updatedAtMs
    : createdAtMs;

  // Si el pedido se hizo antes de que abriera la tienda hoy, su ventana de 20 min comenzó a la hora de apertura
  const startWindowMs = effectiveBaseTime < schedule.todayOpenMs
    ? schedule.todayOpenMs
    : effectiveBaseTime;

  const storedDeadlineMs = isPaymentExpired
    ? autoCancelAt
    : Number(order.EXPIRESAT || 0);
  const deadlineMs = storedDeadlineMs > 0 ? storedDeadlineMs : startWindowMs + PAYMENT_WINDOW_MS;
  const configuredWindowMs = isPaymentExpired
    ? ORDER_AUTO_CANCEL_WINDOW_MS
    : Number(order.EXPIRATIONWINDOWMINUTES || 0) * 60 * 1000;
  const progressWindowMs = configuredWindowMs > 0
    ? configuredWindowMs
    : Math.max(1, deadlineMs - startWindowMs);

  if (nowMs >= deadlineMs) {
    return {
      isOpen: true,
      isPaused: false,
      isExpired: true,
      level: 'rojo',
      remainingPct: 0,
      remainingText: isPaymentExpired ? 'Cancelación pendiente' : 'Expirado',
      badgeText: isPaymentExpired ? '⚠️ Cancelación pendiente' : '⏱️ Expirado',
      deadlineMs,
    };
  }

  const remainingMs = deadlineMs - nowMs;
  const pct = Math.max(0, Math.min(100, Math.round((remainingMs / progressWindowMs) * 100)));
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const timeText = isPaymentExpired
    ? `${Math.floor(remainingMs / 3600000)}h ${String(mins % 60).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
    : `${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;
  const level = isPaymentExpired ? 'rojo' : (remainingMs < 5 * 60000 ? 'rojo' : (remainingMs < 10 * 60000 ? 'amarillo' : 'verde'));

  return {
    isOpen: true,
    isPaused: false,
    isExpired: false,
    level,
    remainingPct: pct,
    remainingText: timeText,
    badgeText: isPaymentExpired ? `⚠️ Se cancela en ${timeText}` : `⏱️ ${timeText}`,
    deadlineMs,
  };
}

/**
 * Calcula la fecha límite consumiendo minutos solo durante el horario de atención.
 * Si el plazo cruza la hora de cierre, el tiempo restante continúa en la próxima apertura.
 */
export function calculatePaymentDeadline(fromMs: number = Date.now(), windowMinutes = PAYMENT_WINDOW_MS / 60000): number {
  let remainingMs = Math.max(1, windowMinutes) * 60 * 1000;
  let cursorMs = fromMs;

  // Max 16 jornadas abiertas: suficiente incluso para el límite de siete días.
  for (let day = 0; day < 16; day++) {
    const schedule = getStoreSchedule(new Date(cursorMs));
    if (!schedule.isOpen) {
      const currentSeconds = schedule.hour * 3600 + schedule.minute * 60 + schedule.second;
      const openSeconds = schedule.openH * 3600;
      if (currentSeconds < openSeconds) {
        cursorMs = schedule.todayOpenMs;
      } else {
        // Próxima apertura: mañana a las 10:00 si hoy es sábado, si no a las 09:00.
        const tomorrowOpenH = schedule.dayOfWeek === 6 ? 10 : 9;
        const secondsUntilMidnight = 86400 - currentSeconds;
        cursorMs += (secondsUntilMidnight + tomorrowOpenH * 3600) * 1000;
      }
      continue;
    }

    const openMsRemainingToday = Math.max(0, schedule.todayCloseMs - cursorMs);
    if (remainingMs <= openMsRemainingToday) return cursorMs + remainingMs;
    remainingMs -= openMsRemainingToday;
    cursorMs = schedule.todayCloseMs;
  }

  // Respaldo defensivo si cambia el horario y el límite de jornadas deja de alcanzar.
  return cursorMs + remainingMs;
}
