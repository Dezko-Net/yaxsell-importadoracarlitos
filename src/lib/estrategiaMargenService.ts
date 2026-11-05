import { initializeApp, getApps, getApp } from 'firebase/app'
import { initializeFirestore, getFirestore, collection, getDocs, query, where, type QueryConstraint } from 'firebase/firestore'
import { getCachedAllProducts, isMainStoreProduct } from '@/lib/catalog-cache'
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess'

const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'importadora-carlitos.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'importadora-carlitos.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '289604179340',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:289604179340:web:9d3f876c8aafeceedef2a9',
}

function getEstrategiaDb() {
  let app = getApps().find((a) => a.name === 'estrategia-app')
  const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || '(default)'
  if (!app) {
    app = initializeApp(FIREBASE_CONFIG, 'estrategia-app')
    return initializeFirestore(app, { experimentalForceLongPolling: true }, databaseId)
  }
  return getFirestore(app, databaseId)
}

export interface EstrategiaProducto {
  sku: string
  nombre: string
  imagen: string
  cantidadVendida: number
  ventasTotales: number
  costoUnitario: number
  costoTotal: number
  precioPromedio: number
  precioDetalleCatalogo: number
  gananciaActual: number
  margenActualPct: number
  clasificacion: 'critico' | 'medio' | 'optimo'
  precioRecomendado25: number
  subidaRecomendada: number
  gananciaExtraSemanal25: number
  gananciaExtraMensual25: number
}

export interface EstrategiaSnapshot {
  sede: string
  fechaInicio: string
  fechaFin: string
  periodoLabel: string
  resumenActual: {
    ventaBrutaTotal: number
    costoTotal: number
    gananciaTotal: number
    margenGlobalPct: number
    totalBoletas: number
    totalUnidades: number
  }
  leyDelVolumen: {
    explicacion: string
    ejemploProducto: {
      nombre: string
      sku: string
      unidades: number
      margenPct: number
      gananciaPorUnidad: number
      porcentajeVentaTienda: number
    }
    productosCriticosCount: number
    porcentajeVentaCriticos: number
  }
  topProductos: EstrategiaProducto[]
  top5AccionesUrgentes: Array<{
    sku: string
    nombre: string
    imagen: string
    unidades: number
    precioActual: number
    precioSugerido: number
    subida: number
    margenActual: number
    margenNuevo: number
    gananciaExtraSemanal: number
    gananciaExtraMensual: number
    motivo: string
  }>
  simulacionBaseTopCriticos: {
    gananciaExtraSemanal: number
    gananciaExtraMensual: number
    nuevoMargenGlobalPct: number
    saltoPuntos: number
  }
}

export async function obtenerEstrategiaMargenSemanal(
  sede: string = 'donbalato-central',
  fechaInicioStr?: string,
  fechaFinStr?: string
): Promise<EstrategiaSnapshot> {
  const db = getEstrategiaDb()

  // Rango por defecto: Semana pasada completa (Lunes 14 a Domingo 20 de Septiembre 2026)
  const inicioStr = fechaInicioStr || '2026-09-14'
  const finStr = fechaFinStr || '2026-09-20'

  const startTs = new Date(`${inicioStr}T00:00:00.000Z`).getTime()
  const endTs = new Date(`${finStr}T23:59:59.999Z`).getTime()

  // 1. Cargar catálogo de productos desde caché compartido (0 lecturas directas)
  const prods = await getCachedAllProducts()
  const catMap = new Map<string, { cost: number; p1: number; name: string; image: string }>()

  prods.filter(isMainStoreProduct).forEach((p: any) => {
    const sku = String(p.SKU || p.sku || p.$id).toUpperCase()
    catMap.set(sku, {
      cost: Number(p.COST || p.cost || p.costo_uni || 0),
      p1: Number(p.PRICE || p.price || p.CURRENTPRICE || 0),
      name: String(p.NAME || p.name || ''),
      image: String(p.IMAGEURL || p.IMAGE || p.image || ''),
    })
  })

  // 2. Cargar ventas del período desde ventas_pos
  const constraints: QueryConstraint[] = [
    where('createdAtTs', '>=', startTs),
    where('createdAtTs', '<=', endTs)
  ]
  // Historical central sales can omit `sede`, so only narrow non-central views.
  if (sede && sede !== 'todas' && !matchBranchSlug(sede, 'donbalato-central')) {
    constraints.unshift(where('sede', 'in', branchSlugQueryValues(sede)))
  }
  const q = query(collection(db, 'ventas_pos'), ...constraints)
  let ventasSnap
  try {
    ventasSnap = await getDocs(q)
  } catch (error) {
    if (!sede || sede === 'todas' || matchBranchSlug(sede, 'donbalato-central')) throw error
    console.warn('[Estrategia margen] Índice por sucursal pendiente; consultando el rango y filtrando localmente:', error)
    ventasSnap = await getDocs(query(
      collection(db, 'ventas_pos'),
      where('createdAtTs', '>=', startTs),
      where('createdAtTs', '<=', endTs)
    ))
  }

  let totalBruto = 0
  let totalCosto = 0
  let totalBoletas = 0
  let totalUnidades = 0
  const itemMap = new Map<
    string,
    {
      sku: string
      nombre: string
      cantidad: number
      subtotal: number
      costoU: number
      costoTotal: number
      image: string
      p1Catalogo: number
    }
  >()

  ventasSnap.forEach((d) => {
    const v = d.data() as any
    if (v.estado === 'anulada') return
    if (sede && sede !== 'todas' && !matchBranchSlug(v.sede || 'donbalato-central', sede)) return

    totalBoletas++

    let items: any[] = []
    if (typeof v.itemsJson === 'string') {
      try {
        items = JSON.parse(v.itemsJson)
      } catch (e) {
        items = []
      }
    } else if (Array.isArray(v.items)) {
      items = v.items
    }

    items.forEach((it) => {
      const sku = String(it.sku || '').toUpperCase()
      const qty = Number(it.cantidad || 0)
      if (qty <= 0) return

      const subtotal = Number(it.subtotal || (Number(it.precioUnitario || 0) * qty))
      let costoU = Number(it.costoUnitario || 0)
      const cat = catMap.get(sku)

      if ((!costoU || costoU <= 0) && cat) {
        costoU = cat.cost
      }

      totalBruto += subtotal
      totalCosto += costoU * qty
      totalUnidades += qty

      const cur = itemMap.get(sku) || {
        sku,
        nombre: String(it.nombre || cat?.name || sku),
        cantidad: 0,
        subtotal: 0,
        costoU,
        costoTotal: 0,
        image: String(it.imageUrl || cat?.image || ''),
        p1Catalogo: cat?.p1 || 0,
      }

      cur.cantidad += qty
      cur.subtotal += subtotal
      cur.costoTotal += costoU * qty
      if (!cur.image && cat?.image) cur.image = cat.image
      itemMap.set(sku, cur)
    })
  })

  // 3. Procesar lista de productos
  const productosList: EstrategiaProducto[] = Array.from(itemMap.values()).map((cur) => {
    const precioPromedio = Math.round(cur.subtotal / (cur.cantidad || 1))
    const gananciaActual = cur.subtotal - cur.costoTotal
    const margenActualPct = cur.subtotal > 0 ? Number(((gananciaActual / cur.subtotal) * 100).toFixed(1)) : 0

    let clasificacion: 'critico' | 'medio' | 'optimo' = 'medio'
    if (margenActualPct < 15) {
      clasificacion = 'critico'
    } else if (margenActualPct > 22) {
      clasificacion = 'optimo'
    }

    // Precio para meta 25% de margen: P = Costo / (1 - 0.25) = Costo / 0.75
    let precioRecomendado25 = cur.costoU > 0 ? Math.ceil((cur.costoU / 0.75) / 10) * 10 : precioPromedio
    if (precioRecomendado25 > 500) {
      precioRecomendado25 = Math.ceil(precioRecomendado25 / 10) * 10
    }
    if (precioRecomendado25 < precioPromedio) {
      precioRecomendado25 = precioPromedio
    }

    const subidaRecomendada = Math.max(0, precioRecomendado25 - precioPromedio)
    const gananciaExtraSemanal25 = cur.cantidad * subidaRecomendada
    const gananciaExtraMensual25 = gananciaExtraSemanal25 * 4

    return {
      sku: cur.sku,
      nombre: cur.nombre,
      imagen: cur.image,
      cantidadVendida: cur.cantidad,
      ventasTotales: Math.round(cur.subtotal),
      costoUnitario: Math.round(cur.costoU),
      costoTotal: Math.round(cur.costoTotal),
      precioPromedio,
      precioDetalleCatalogo: cur.p1Catalogo,
      gananciaActual: Math.round(gananciaActual),
      margenActualPct,
      clasificacion,
      precioRecomendado25,
      subidaRecomendada,
      gananciaExtraSemanal25: Math.round(gananciaExtraSemanal25),
      gananciaExtraMensual25: Math.round(gananciaExtraMensual25),
    }
  })

  // Ordenar por cantidad vendida de mayor a menor (volumen)
  productosList.sort((a, b) => b.cantidadVendida - a.cantidadVendida)

  const gananciaTotal = totalBruto - totalCosto
  const margenGlobalPct = totalBruto > 0 ? Number(((gananciaTotal / totalBruto) * 100).toFixed(1)) : 0

  // 4. Diagnóstico "Ley del Volumen"
  const top1 = productosList[0] || {
    nombre: 'TRAPERO HÚMEDO VI-MAS 10+2',
    sku: 'IDB1038',
    cantidadVendida: 1069,
    margenActualPct: 8.0,
    costoUnitario: 580,
    precioPromedio: 630,
    ventasTotales: 673600,
  }

  const criticos = productosList.filter((p) => p.clasificacion === 'critico')
  const ventaCriticos = criticos.reduce((s, p) => s + p.ventasTotales, 0)
  const pctVentaCriticos = totalBruto > 0 ? Number(((ventaCriticos / totalBruto) * 100).toFixed(1)) : 0

  const leyDelVolumen = {
    explicacion:
      'El margen general de la tienda NO es el promedio simple de los productos, sino el promedio ponderado por el volumen de venta. Si los productos que mueven miles de unidades tienen un margen bajo (7% a 12%), arrastran la rentabilidad de toda la tienda hacia abajo aunque otros productos tengan 30% o 40%.',
    ejemploProducto: {
      nombre: top1.nombre,
      sku: top1.sku,
      unidades: top1.cantidadVendida,
      margenPct: top1.margenActualPct,
      gananciaPorUnidad: Math.max(0, top1.precioPromedio - top1.costoUnitario),
      porcentajeVentaTienda: totalBruto > 0 ? Number(((top1.ventasTotales / totalBruto) * 100).toFixed(1)) : 0,
    },
    productosCriticosCount: criticos.length,
    porcentajeVentaCriticos: pctVentaCriticos,
  }

  // 5. Top 5 Acciones Urgentes
  const topCriticosVolume = productosList.filter((p) => p.clasificacion === 'critico').slice(0, 5)

  const motivosMap: Record<string, string> = {
    IDB1038: 'Es el producto #1 en ventas de toda la tienda. Con subir $100 pesos nadie deja de comprarlo y ganas +$427.000 limpios al mes.',
    IDBYDA0031: 'Margen de 8.7% es muy bajo para toallas húmedas. Subiendo solo $85 pesos recuperas margen saludable.',
    IDB1092: 'Vaso de vidrio vendido a $378 deja solo $28 pesos de margen. En $450 sigue siendo el más barato del sector.',
    IDB688: 'Servilleta Noé de 300 hojas tiene tremenda rotación; un ajuste de $100 pesos pasa desapercibido y suma directo a la ganancia.',
    IDB703: 'Toallín gigante de 150mts: con su volumen, un incremento de $150 pesos inyecta más de $130.000 limpios cada mes.',
  }

  const top5AccionesUrgentes = topCriticosVolume.map((p) => {
    let subidaSugerida = 100
    if (p.precioPromedio < 500) subidaSugerida = 70
    else if (p.precioPromedio > 1000) subidaSugerida = 150

    const precioSugerido = p.precioPromedio + subidaSugerida
    const nuevoMargen = Number((((precioSugerido - p.costoUnitario) / precioSugerido) * 100).toFixed(1))
    const extraSemanal = p.cantidadVendida * subidaSugerida
    const extraMensual = extraSemanal * 4

    return {
      sku: p.sku,
      nombre: p.nombre,
      imagen: p.imagen,
      unidades: p.cantidadVendida,
      precioActual: p.precioPromedio,
      precioSugerido,
      subida: subidaSugerida,
      margenActual: p.margenActualPct,
      margenNuevo: nuevoMargen,
      gananciaExtraSemanal: Math.round(extraSemanal),
      gananciaExtraMensual: Math.round(extraMensual),
      motivo: motivosMap[p.sku] || `Mueve ${p.cantidadVendida} unidades con solo ${p.margenActualPct}% de margen. Subiendo $${subidaSugerida} ganas $${Math.round(extraMensual).toLocaleString('es-CL')} extra al mes.`,
    }
  })

  // 6. Simulación global si se ajustan los productos críticos de volumen
  let gananciaExtraSemanalCriticos = 0
  criticos.slice(0, 15).forEach((c) => {
    let subida = 100
    if (c.precioPromedio < 500) subida = 50
    else if (c.precioPromedio > 1200) subida = 150
    gananciaExtraSemanalCriticos += c.cantidadVendida * subida
  })

  const nuevaVentaGlobal = totalBruto + gananciaExtraSemanalCriticos
  const nuevaGananciaGlobal = gananciaTotal + gananciaExtraSemanalCriticos
  const nuevoMargenGlobalPct = nuevaVentaGlobal > 0 ? Number(((nuevaGananciaGlobal / nuevaVentaGlobal) * 100).toFixed(1)) : margenGlobalPct
  const saltoPuntos = Number((nuevoMargenGlobalPct - margenGlobalPct).toFixed(1))

  return {
    sede,
    fechaInicio: inicioStr,
    fechaFin: finStr,
    periodoLabel: 'Semana Pasada Completa (14 al 20 de Septiembre 2026)',
    resumenActual: {
      ventaBrutaTotal: Math.round(totalBruto),
      costoTotal: Math.round(totalCosto),
      gananciaTotal: Math.round(gananciaTotal),
      margenGlobalPct,
      totalBoletas,
      totalUnidades,
    },
    leyDelVolumen,
    topProductos: productosList.slice(0, 30),
    top5AccionesUrgentes,
    simulacionBaseTopCriticos: {
      gananciaExtraSemanal: Math.round(gananciaExtraSemanalCriticos),
      gananciaExtraMensual: Math.round(gananciaExtraSemanalCriticos * 4),
      nuevoMargenGlobalPct,
      saltoPuntos,
    },
  }
}
