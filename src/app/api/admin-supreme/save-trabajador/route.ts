import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/db-server'

const TRABAJADORES_COLLECTION = 'trabajadores_erp'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nombre, cargo, sede, sueldo, fotoUrl, activo, nacionalidad, genero, fechaIngreso } = body

    if (!nombre || !sede) {
      return NextResponse.json({ ok: false, error: 'Faltan nombre y sede' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const colRef = adminDb.collection(TRABAJADORES_COLLECTION)
    const payload = {
      nombre,
      cargo: cargo || 'Cajera',
      sede,
      sueldo: Number(sueldo) || 0,
      fotoUrl: fotoUrl || '',
      activo: activo !== false,
      posActivo: true,
      nacionalidad: nacionalidad || '',
      genero: genero || '',
      fechaIngreso: fechaIngreso || new Date().toISOString().slice(0, 10),
      creadoEn: Date.now(),
      storeId: 'main_store',
    }

    const docRef = await colRef.add(payload)
    return NextResponse.json({ ok: true, id: docRef.id })
  } catch (e: any) {
    console.error('[admin-supreme/save-trabajador] error:', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
