/** Monto mínimo de compra por defecto (se evalúa sobre el total a pagar, con descuentos). */
export const MINIMUM_ORDER_CLP = 50_000;

/** Retorna true si el total a pagar está por debajo del mínimo. */
export function isBelowMinimumOrder(totalAfterDiscounts: number, minOrder: number = MINIMUM_ORDER_CLP): boolean {
  return totalAfterDiscounts < minOrder;
}

export function minimumOrderMessage(totalAfterDiscounts: number, minOrder: number = MINIMUM_ORDER_CLP): string {
  const base = `El monto mínimo de compra es $${minOrder.toLocaleString('es-CL')}.`;
  return `${base} Tu total a pagar es $${Math.round(totalAfterDiscounts).toLocaleString('es-CL')}.`;
}

/**
 * Evalúa si un pedido cuenta con sus datos de envío/despacho completos.
 * Retorna true si el cliente ya ingresó su dirección/agencia o seleccionó retiro en tienda.
 */
export function hasShippingData(order?: {
  ADDRESS?: string;
  SHIPPINGADDRESS?: string;
  COMUNA?: string;
  CUSTOMERCOMUNA?: string;
  REGION?: string;
  SHIPPINGREGION?: string;
  SHIPPINGAGENCY?: string;
  ADDRESSPHOTOURL?: string;
} | null): boolean {
  if (!order) return false;

  const agency = (order.SHIPPINGAGENCY || '').trim();
  // 1. Retiro en tienda presencial ya define la entrega sin requerir dirección de despacho
  if (agency.toUpperCase() === 'RETIRO EN TIENDA') return true;

  const address = (order.ADDRESS || order.SHIPPINGADDRESS || '').trim();
  const comuna = (order.COMUNA || order.CUSTOMERCOMUNA || '').trim();
  const region = (order.REGION || order.SHIPPINGREGION || '').trim();
  const hasPhoto = Boolean(order.ADDRESSPHOTOURL?.trim());

  const hasValidAddress = address.length > 0 && address !== '-';
  const hasValidAgency = agency.length > 0 && agency !== '-';
  const hasValidComuna = comuna.length > 0 && comuna !== '-';
  const hasValidRegion = region.length > 0 && region !== '-';

  if (hasPhoto) return true;
  if (hasValidAddress && (hasValidAgency || hasValidComuna || hasValidRegion)) return true;
  if (hasValidAgency && (hasValidComuna || hasValidAddress)) return true;

  return false;
}
