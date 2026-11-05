export function normalizeCashierIdentity(value: unknown): string {
  return String(value || '')
    .replace(/^\s*cajer[oa]\s*:\s*/i, '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function saleBelongsToCashier(sale: any, identity: { id?: string; name?: string }): boolean {
  const saleCashierId = String(sale?.cajeroId || sale?.cashierId || '').trim()
  const cashierId = String(identity.id || '').trim()
  if (saleCashierId && cashierId) return saleCashierId === cashierId

  const saleName = normalizeCashierIdentity(sale?.cajeroNombre || sale?.cajeraNombre)
  const currentName = normalizeCashierIdentity(identity.name)
  return Boolean(saleName && currentName && saleName === currentName)
}
