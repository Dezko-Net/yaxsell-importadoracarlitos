import { NextRequest, NextResponse } from 'next/server';
import { isSupremeAdminRequest } from '@/lib/admin-api-auth';
import { serverUploadFile, cleanStorageUrl } from '@/lib/db-server';
import { compressImageKeepFormat } from '@/lib/image-compression';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!(await isSupremeAdminRequest(req))) {
    return NextResponse.json({ error: 'Acceso administrativo requerido' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'No se envió ningún archivo de imagen' }, { status: 400 });
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, format } = await compressImageKeepFormat(originalBuffer);

    const baseName = (file.name || 'logo').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `logos/${Date.now()}-${baseName}.${format}`;

    const uploaded = await serverUploadFile('vendors', compressedBuffer, fileName);
    const imageUrl = cleanStorageUrl(uploaded.url);

    return NextResponse.json({
      success: true,
      imageUrl,
      url: imageUrl,
    });
  } catch (err: any) {
    console.error('[admin/vendors/upload-logo POST]', err);
    return NextResponse.json({ success: false, error: err?.message || 'Error al subir el logo' }, { status: 500 });
  }
}
