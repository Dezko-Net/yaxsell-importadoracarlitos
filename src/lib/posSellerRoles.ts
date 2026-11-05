export const POS_SELLER_ROLES = ['ayudante_caja', 'cajero_express'] as const
export type PosSellerRole = typeof POS_SELLER_ROLES[number]

export function normalizePosSellerRole(value: unknown): PosSellerRole {
  return value === 'cajero_express' ? 'cajero_express' : 'ayudante_caja'
}

export function isSellerCargo(value: unknown): boolean {
  return /vended/i.test(String(value || ''))
}
