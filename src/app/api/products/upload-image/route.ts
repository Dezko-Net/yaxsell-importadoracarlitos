import { NextRequest, NextResponse } from 'next/server';
import { serverUploadFile, getServerFileUrl, serverUpdateDocument, serverListDocuments, cleanStorageUrl } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { compressImageKeepFormat } from '@/lib/image-compression';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const productName = formData.get('productName') as string | null;
    const productId = formData.get('productId') as string | null;
    const imageField = (formData.get('imageField') as string) || 'IMAGEURL'; // IMAGEURL, IMAGEURL2, IMAGEURL3

    if (!file) {
      return NextResponse.json({ success: false, error: 'No se envió archivo' }, { status: 400 });
    }

    // Comprimir imagen antes de subir
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, format } = await compressImageKeepFormat(originalBuffer);

    // Nombre del archivo con extensión correcta
    const originalName = file.name || 'upload.jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.${format}`;

    // Upload to Firebase Storage (imagen comprimida)
    const uploaded = await serverUploadFile('media', compressedBuffer, fileName);
    const imageUrl = cleanStorageUrl(getServerFileUrl('media', uploaded.$id));

    // If productName or productId provided, update the product
    if (productName || productId) {
      let docId = productId;

      if (!docId && productName) {
        const result = await serverListDocuments(PRODUCTS_COLLECTION_ID, [
          JSON.stringify({ method: 'equal', attribute: 'NAME', values: [productName] }),
        ]);
        if (result.documents && result.documents.length > 0) {
          docId = (result.documents[0] as any).$id;
        }
      }

      if (docId) {
        const OPTIONAL_ATTRS = ['TAGS', 'FEATURES', 'sku', 'barcode', 'IMAGEURL2', 'IMAGEURL3'];
        const updates: Record<string, unknown> = { [imageField]: imageUrl };

        try {
          await serverUpdateDocument(PRODUCTS_COLLECTION_ID, docId, updates);
        } catch (attrErr: any) {
          if (attrErr?.message?.includes('Unknown attribute')) {
            const safeUpdates = { ...updates };
            for (const attr of OPTIONAL_ATTRS) delete safeUpdates[attr];
            await serverUpdateDocument(PRODUCTS_COLLECTION_ID, docId, safeUpdates);
          } else {
            throw attrErr;
          }
        }
      }
    }

    const originalSizeKB = Math.round(originalBuffer.length / 1024);
    const compressedSizeKB = Math.round(compressedBuffer.length / 1024);
    const savings = Math.round((1 - compressedBuffer.length / originalBuffer.length) * 100);

    return NextResponse.json({
      success: true,
      imageUrl,
      fileId: uploaded.$id,
      message: 'Imagen subida exitosamente',
      compression: {
        originalSize: `${originalSizeKB} KB`,
        compressedSize: `${compressedSizeKB} KB`,
        savings: `${savings}%`,
        format,
      },
    });
  } catch (error: any) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al subir imagen' },
      { status: 500 }
    );
  }
}
