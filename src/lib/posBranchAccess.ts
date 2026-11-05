/** Sucursales autorizadas en la ficha del trabajador de planilla. */

export function normalizeBranchSlug(slug: string | null | undefined): string {
  if (!slug) return ''
  return String(slug)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Comprueba si dos identificadores de sucursal representan la misma sede (ignora mayúsculas, guiones y tildes). */
export function matchBranchSlug(a: string | null | undefined, b: string | null | undefined): boolean {
  const normA = normalizeBranchSlug(a)
  const normB = normalizeBranchSlug(b)
  if (!normA || !normB) return false
  if (normA === normB) return true
  // Importadora Carlitos Central es la sede histórica conocida como Importadora Carlitos A
  const isCentralA = (s: string) => s === 'donbalatocentral' || s === 'donbalatoa' || s === 'central'
  if (isCentralA(normA) && isCentralA(normB)) return true
  return false
}

/** Valores históricos que pueden existir en `ventas_pos.sede` para consultar una sede sin leer las demás. */
export function branchSlugQueryValues(branch: string | null | undefined): string[] {
  const raw = String(branch || '').trim()
  if (!raw) return []

  const normalized = normalizeBranchSlug(raw)
  const values = new Set([raw, raw.toLowerCase(), raw.replace(/[-_]+/g, ' ')])
  const displayName = getBranchDisplayName(raw)
  if (displayName) values.add(displayName)

  if (['donbalatocentral', 'donbalatoa', 'central'].includes(normalized)) {
    [
      'donbalato-central', 'donbalatocentral', 'Importadora Carlitos Central',
      'don-balato-a', 'donbalato-a', 'Importadora Carlitos A', 'central', 'Central',
    ].forEach(value => values.add(value))
  } else if (normalized === 'donbalatob') {
    ['don-balato-b', 'donbalato-b', 'Importadora Carlitos B'].forEach(value => values.add(value))
  }

  return Array.from(values).slice(0, 30)
}

export function workerBranchSlugs(worker: { sede?: string | null; sedesAdicionales?: string[] | null } | null | undefined): string[] {
  if (!worker) return []
  const primary = String(worker.sede || '').trim()
  const additional = Array.isArray(worker.sedesAdicionales) ? worker.sedesAdicionales : []
  return Array.from(new Set([primary, ...additional.map(value => String(value || '').trim())].filter(Boolean)))
}

export function workerCanAccessBranch(worker: { sede?: string | null; sedesAdicionales?: string[] | null } | null | undefined, branch: string): boolean {
  if (!branch) return false
  return workerBranchSlugs(worker).some(slug => matchBranchSlug(slug, branch))
}

/** Devuelve el nombre legible para mostrar al usuario según el identificador de la sucursal. */
export function getBranchDisplayName(slug: string | null | undefined): string {
  if (!slug) return 'Sucursal'
  const norm = normalizeBranchSlug(slug)
  if (norm === 'donbalatocentral' || norm === 'donbalatoa' || norm === 'central') return 'Importadora Carlitos A'
  if (norm === 'donbalatob') return 'Importadora Carlitos B'
  return String(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}
