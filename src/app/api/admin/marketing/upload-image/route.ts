import { NextRequest, NextResponse } from 'next/server';
import { serverUploadFile, cleanStorageUrl } from '@/lib/db-server';
import { compressImageKeepFormat } from '@/lib/image-compression';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const slot = (formData.get('slot') as string) || 'hero'; // hero | news

    if (!file) {
      return NextResponse.json({ success: false, error: 'No se envió archivo' }, { status: 400 });
    }

    // Comprimir imagen antes de subir
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, format } = await compressImageKeepFormat(originalBuffer);

    // Nombre del archivo: marketing/<slot>/<timestamp>.<ext>
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    const fileName = `marketing/${slot}/${Date.now()}-${baseName}.${format}`;

    // Upload to Firebase Storage
    const uploaded = await serverUploadFile('media', compressedBuffer, fileName);
    // Usar la URL con token que devuelve serverUploadFile, no getServerFileUrl
    const imageUrl = cleanStorageUrl(uploaded.url);

    const originalSizeKB = Math.round(originalBuffer.length / 1024);
    const compressedSizeKB = Math.round(compressedBuffer.length / 1024);
    const savings = Math.round((1 - compressedBuffer.length / originalBuffer.length) * 100);

    return NextResponse.json({
      success: true,
      imageUrl,
      fileId: uploaded.$id,
      compression: {
        originalSize: `${originalSizeKB} KB`,
        compressedSize: `${compressedSizeKB} KB`,
        savings: `${savings}%`,
        format,
      },
    });
  } catch (error: any) {
    console.error('[API marketing/upload-image] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al subir imagen' },
      { status: 500 }
    );
  }
}
