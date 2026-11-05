export type DemoWorker = {
  id: string
  nombre: string
  cargo: string
  sede: 'la-florida' | 'copiapo' | 'alameda'
  fotoUrl: string
  nacionalidad: string
  genero: 'HOMBRE' | 'MUJER'
  sueldo: number
  fechaIngreso: string
}

export const DEMO_WORKERS: DemoWorker[] = [
  {
    id: 'demo-w-1',
    nombre: 'Valentina Perez',
    cargo: 'Jefa de Turno',
    sede: 'la-florida',
    fotoUrl: 'https://plus.unsplash.com/premium_photo-1661726660137-61b182d93809?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8cGVyZmlsJTIwcHJvZmVzaW9uYWx8ZW58MHx8MHx8fDA%3D',
    nacionalidad: 'CHILENA',
    genero: 'MUJER',
    sueldo: 780000,
    fechaIngreso: '2024-03-15',
  },
  {
    id: 'demo-w-2',
    nombre: 'Javiera Rojas',
    cargo: 'Cajera Senior',
    sede: 'la-florida',
    fotoUrl: 'https://img.freepik.com/fotos-premium/retrato-empresaria-sonriente-que-trabaja-laptop-lugar-trabajo-oficina-moderna_44344-4197.jpg',
    nacionalidad: 'CHILENA',
    genero: 'MUJER',
    sueldo: 660000,
    fechaIngreso: '2024-07-02',
  },
  {
    id: 'demo-w-3',
    nombre: 'Diego Morales',
    cargo: 'Supervisor de Caja',
    sede: 'copiapo',
    fotoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
    nacionalidad: 'CHILENO',
    genero: 'HOMBRE',
    sueldo: 820000,
    fechaIngreso: '2023-11-20',
  },
  {
    id: 'demo-w-4',
    nombre: 'Nicolas Fuentes',
    cargo: 'Encargado de Bodega',
    sede: 'copiapo',
    fotoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=face',
    nacionalidad: 'CHILENO',
    genero: 'HOMBRE',
    sueldo: 690000,
    fechaIngreso: '2024-02-10',
  },
  {
    id: 'demo-w-5',
    nombre: 'Camila Rojas',
    cargo: 'Encargada de Operaciones',
    sede: 'alameda',
    fotoUrl: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=400&h=400&fit=crop&crop=face',
    nacionalidad: 'CHILENA',
    genero: 'MUJER',
    sueldo: 810000,
    fechaIngreso: '2023-09-05',
  },
  {
    id: 'demo-w-6',
    nombre: 'Matias Soto',
    cargo: 'Vendedor Integral',
    sede: 'alameda',
    fotoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face',
    nacionalidad: 'CHILENO',
    genero: 'HOMBRE',
    sueldo: 640000,
    fechaIngreso: '2024-05-12',
  },
]

export const getDemoWorkersBySede = (sede: 'la-florida' | 'copiapo' | 'alameda') =>
  DEMO_WORKERS.filter((w) => w.sede === sede)
