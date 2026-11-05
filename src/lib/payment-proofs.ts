/**
 * Helpers para manejar hasta 3 comprobantes de pago guardados
 * en el campo PAYMENTPROOFURL como un arreglo JSON.
 *
 * Backward-compatible: si el valor es una URL simple, se trata como el
 * primer comprobante.
 */

export const MAX_PAYMENT_PROOFS = 3;

export function parsePaymentProofs(value: string | undefined | null): string[] {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
    } catch {}
    return [];
  }
  if (trimmed.startsWith('http')) return [trimmed];
  return [];
}

export function serializePaymentProofs(urls: string[]): string {
  const valid = urls.filter(Boolean).slice(0, MAX_PAYMENT_PROOFS);
  if (valid.length === 0) return '';
  if (valid.length === 1) return valid[0];
  return JSON.stringify(valid);
}
