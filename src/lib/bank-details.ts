/** Avoid presenting payment instructions until all required bank details exist. */
export function hasCompleteBankDetails(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const bank = value as Record<string, unknown>;
  return ['bank', 'type', 'account', 'rut', 'holder'].every(key => String(bank[key] || '').trim().length > 0);
}
