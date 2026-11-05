export const ORDER_AUTO_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

function toTimestampMs(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      const nanos = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
      return seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * El pedido puede subir el comprobante hasta que cumpla 24 horas desde que
 * fue creado. CREATEDAT es el reloj de referencia; AUTOCANCELAT queda como
 * respaldo para documentos antiguos que no guardaron la fecha de creación.
 */
export function getOrderAutoCancelDeadline(order: any): number {
  const createdAt = [order?.CREATEDAT, order?.createdAt, order?.$createdAt]
    .map(toTimestampMs)
    .find(timestamp => timestamp > 0) || 0;
  if (createdAt > 0) return createdAt + ORDER_AUTO_CANCEL_WINDOW_MS;

  const storedDeadline = toTimestampMs(order?.AUTOCANCELAT);
  if (storedDeadline > 0) return storedDeadline;

  const paymentExpiredAt = toTimestampMs(order?.PAYMENTEXPIREDAT || order?.EXPIRESAT);
  return paymentExpiredAt > 0 ? paymentExpiredAt + ORDER_AUTO_CANCEL_WINDOW_MS : 0;
}
