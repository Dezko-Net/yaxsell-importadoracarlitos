export const POS_ACCESS_LEVELS = ['bajo', 'medio', 'alto'] as const

export type PosAccessLevel = typeof POS_ACCESS_LEVELS[number]

export const POS_ACCESS_RANK: Record<PosAccessLevel, number> = {
  bajo: 1,
  medio: 2,
  alto: 3,
}

export function normalizePosAccessLevel(value: unknown, legacyCashPermission?: unknown): PosAccessLevel {
  if (value === 'bajo' || value === 'medio' || value === 'alto') return value
  // La configuración previa solo distinguía si podía gestionar caja.
  // Una cuenta sin permiso explícito queda en el nivel mínimo.
  return legacyCashPermission === true ? 'medio' : 'bajo'
}

export function hasPosAccessLevel(level: unknown, minimum: PosAccessLevel): boolean {
  const normalized = normalizePosAccessLevel(level)
  return POS_ACCESS_RANK[normalized] >= POS_ACCESS_RANK[minimum]
}

export function modulesForPosAccessLevel(existing: unknown, level: PosAccessLevel): string[] {
  // Recalcula el acceso POS sin borrar permisos Web asignados por un segundo cargo.
  const modules = new Set<string>(['pos'])
  const currentModules = Array.isArray(existing) ? existing : []
  if (currentModules.includes('web')) modules.add('web')
  if (level === 'medio' || level === 'alto') {
    modules.add('pos_admin')
    modules.add('base_datos')
  }
  return [...modules]
}
