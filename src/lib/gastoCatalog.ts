// Catálogo compartido para que los gastos registrados desde POS y ERP usen
// exactamente los mismos valores de clasificación.
export const ERP_GASTO_TIPOS = [
  'Operacional',
  'Gasto de mercadería',
  'Mantenimiento',
  'Servicios',
  'Marketing',
  'Personal',
  'Administrativo',
  'Alimentación',
  'Transporte',
  'Otros',
] as const

export const ERP_GASTO_CATEGORIAS = [
  'Suministros',
  'Reparaciones',
  'Servicios Públicos',
  'Publicidad',
  'Recursos Humanos',
  'Oficina',
  'Alimentación',
  'Transporte',
  'Otros',
] as const
