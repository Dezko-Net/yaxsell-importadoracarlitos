import { NextRequest, NextResponse } from 'next/server'
import { serverUploadFile, cleanStorageUrl } from '@/lib/db-server'
import { compressImageKeepFormat } from '@/lib/image-compression'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const slot = (formData.get('slot') as string) || 'logo' // logo | avatar | branch

    if (!file) {
      return NextResponse.json({ success: false, error: 'No se envió archivo' }, { status: 400 })
    }

    // Comprimir imagen antes de subir
    const originalBuffer = Buffer.from(await file.arrayBuffer())
    const { buffer: compressedBuffer, format } = await compressImageKeepFormat(originalBuffer)

    // Nombre del archivo: admin-supreme/<slot>/<timestamp>.<ext>
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen'
    const fileName = `admin-supreme/${slot}/${Date.now()}-${baseName}.${format}`

    // Upload to Firebase Storage
    const uploaded = await serverUploadFile('media', compressedBuffer, fileName)
    const imageUrl = cleanStorageUrl(uploaded.url)

    return NextResponse.json({
      success: true,
      imageUrl,
      compression: {
        originalSize: `${Math.round(originalBuffer.length / 1024)} KB`,
        compressedSize: `${Math.round(compressedBuffer.length / 1024)} KB`,
        savings: `${Math.round((1 - compressedBuffer.length / originalBuffer.length) * 100)}%`,
        format,
      },
    })
  } catch (error: any) {
    console.error('[API admin-supreme/upload-image] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Error al subir imagen' },
      { status: 500 }
    )
  }
}
