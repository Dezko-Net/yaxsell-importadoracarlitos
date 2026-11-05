import { NextRequest, NextResponse } from 'next/server'
import { obtenerEstrategiaMargenSemanal } from '@/lib/estrategiaMargenService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sede = searchParams.get('sede') || 'donbalato-central'
    const fechaInicio = searchParams.get('fechaInicio') || undefined
    const fechaFin = searchParams.get('fechaFin') || undefined

    const data = await obtenerEstrategiaMargenSemanal(sede, fechaInicio, fechaFin)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[API /api/cuadres/estrategia-margen] Error:', err)
    return NextResponse.json(
      { error: err?.message || 'Error al obtener análisis de estrategia de margen' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const sede = body.sede || 'donbalato-central'
    const fechaInicio = body.fechaInicio || undefined
    const fechaFin = body.fechaFin || undefined

    const data = await obtenerEstrategiaMargenSemanal(sede, fechaInicio, fechaFin)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[API /api/cuadres/estrategia-margen] Error:', err)
    return NextResponse.json(
      { error: err?.message || 'Error al obtener análisis de estrategia de margen' },
      { status: 500 }
    )
  }
}
