import { NextRequest, NextResponse } from 'next/server'
import { AI_ENABLED } from '@/lib/feature-flags'
import { analizarProductosDelDia, chatContador } from '@/lib/iaContadorService'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    if (!AI_ENABLED) {
      return NextResponse.json({ error: 'IA desactivada' }, { status: 403 })
    }

    const body = await req.json()
    const { sede, fecha, accion, mensaje } = body as {
      sede: string
      fecha: string
      accion: 'analizar' | 'chat'
      mensaje?: string
    }

    if (!sede || !fecha) {
      return NextResponse.json({ error: 'sede y fecha son requeridos' }, { status: 400 })
    }

    if (accion === 'chat') {
      if (!mensaje) {
        return NextResponse.json({ error: 'mensaje es requerido para chat' }, { status: 400 })
      }
      const texto = await chatContador(sede, fecha, mensaje)
      return NextResponse.json({ texto })
    }

    // accion === 'analizar'
    const result = await analizarProductosDelDia(sede, fecha)
    return NextResponse.json({
      texto: result.texto,
      alertas: result.alertas,
      recomendaciones: result.recomendaciones,
      snapshot: {
        sede: result.snapshot.sedeName,
        fecha: result.snapshot.fecha,
        totalBruto: result.snapshot.day.totalBruto,
        totalGanancia: result.snapshot.day.totalGanancia,
        boletasCount: result.snapshot.day.boletasCount,
        tendencia: result.snapshot.tendencia,
      },
    })
  } catch (err: any) {
    console.error('[API ai-analisis-productos] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Error interno del Contador IA' },
      { status: 500 },
    )
  }
}
