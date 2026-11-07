/**
 * Helpers para manejar hasta 3 comprobantes de pago guardados
 * en el campo PAYMENTPROOFURL como un arreglo JSON.
 *
 * Backward-compatible: si el valor es una URL simple, se trata como el
 * primer comprobante.
 */

export const MAX_PAYMENT_PROOFS = 3;

/** Recupera enlaces generados por el antiguo adaptador de Storage del panel. */
export function normalizePaymentProofUrl(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\/storage\/buckets\/media\/files\/([A-Za-z0-9_-]+)\/view(?:\?([^#]*))?$/);
  if (!match) return trimmed;
  const params = new URLSearchParams(match[2] || '');
  const ext = (params.get('ext') || '').toLowerCase();
  const extension = /^[a-z0-9]{1,8}$/.test(ext) ? `&ext=${ext}` : '';
  return `/api/media-proxy?url=${encodeURIComponent(`media/${match[1]}`)}${extension}`;
}

export function parsePaymentProofs(value: string | undefined | null): string[] {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u.trim()).map(normalizePaymentProofUrl);
    } catch {}
    return [];
  }
  const normalized = normalizePaymentProofUrl(trimmed);
  if (normalized.startsWith('http') || normalized.startsWith('/api/media-proxy?')) return [normalized];
  return [];
}

export function serializePaymentProofs(urls: string[]): string {
  const valid = urls.filter(Boolean).slice(0, MAX_PAYMENT_PROOFS);
  if (valid.length === 0) return '';
  if (valid.length === 1) return valid[0];
  return JSON.stringify(valid);
}
