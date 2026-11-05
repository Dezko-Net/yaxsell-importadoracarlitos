import { NextRequest, NextResponse } from 'next/server';
import { serverUploadFile, getServerFileUrl } from '@/lib/db-server';
import { compressImageKeepFormat } from '@/lib/image-compression';

const STORAGE_BUCKET_ID = 'media';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No se envió archivo' }, { status: 400 });
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, format } = await compressImageKeepFormat(originalBuffer);
    const originalName = file.name || 'chat-image.jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.${format}`;

    const uploaded = await serverUploadFile(STORAGE_BUCKET_ID, compressedBuffer, fileName);
    const url = getServerFileUrl(STORAGE_BUCKET_ID, uploaded.$id);

    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    console.error('Error uploading chat image:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al subir imagen' },
      { status: 500 }
    );
  }
}
