import { NextRequest, NextResponse } from 'next/server';
import { serverUploadFile, serverUpdateDocument, serverGetDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';
import { ORDER_BOX_PHOTOS_BUCKET_ID } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import { compressImageKeepFormat } from '@/lib/image-compression';

export const dynamic = 'force-dynamic';

interface BoxPhoto {
  bulto: number;
  url: string;
}

function parseBoxPhotos(value: unknown): BoxPhoto[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((photo, index) => typeof photo === 'string'
        ? { bulto: index + 1, url: photo }
        : { bulto: Number(photo?.bulto || index + 1), url: String(photo?.url || '') })
      .filter(photo => photo.url)
      .sort((a, b) => a.bulto - b.bulto);
  } catch {
    return [];
  }
}

// POST: Subir foto de bulto para un pedido
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const orderId = formData.get('orderId') as string;
    const bultoIndex = formData.get('bultoIndex') as string; // "1", "2", etc.
    const file = formData.get('file') as File;

    if (!orderId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Falta orderId o file' }, { status: 400 });
    }

    const bultoNum = parseInt(bultoIndex, 10);
    if (!Number.isInteger(bultoNum) || bultoNum < 1 || bultoNum > 10) {
      return NextResponse.json({ error: 'El número de bulto debe estar entre 1 y 10' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'La foto supera el máximo de 15 MB' }, { status: 400 });
    }

    // Obtener el pedido actual para ver BOXPHOTOS existentes
    const order = await serverGetDocument(ORDERS_COLLECTION_ID, orderId) as any;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    if (order.STATUS !== 'shipped') {
      return NextResponse.json({ error: 'Solo se pueden modificar pedidos embalados' }, { status: 409 });
    }
    const configuredCount = Number(order.BULTOCOUNT || 0);
    if (configuredCount < bultoNum) {
      return NextResponse.json({ error: 'El bulto no está dentro de la cantidad configurada' }, { status: 400 });
    }

    // Subir archivo al bucket (comprimido)
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, format } = await compressImageKeepFormat(originalBuffer);
    const fileName = `bulto_${orderId}_${bultoNum}_${Date.now()}.${format}`;
    const uploaded = await serverUploadFile(ORDER_BOX_PHOTOS_BUCKET_ID, compressedBuffer, fileName);
    const fileUrl = uploaded.url;

    let boxPhotos = parseBoxPhotos(order.BOXPHOTOS);

    // Agregar o reemplazar la foto del bulto
    const existing = boxPhotos.find(p => p.bulto === bultoNum);
    if (existing) {
      existing.url = fileUrl;
    } else {
      boxPhotos.push({ bulto: bultoNum, url: fileUrl });
      boxPhotos.sort((a, b) => a.bulto - b.bulto);
    }

    // Actualizar el pedido
    await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
      BOXPHOTOS: JSON.stringify(boxPhotos),
      UPDATEDAT: Date.now(),
    });

    try { revalidateTag('orders'); } catch {}

    return NextResponse.json({
      success: true,
      fileUrl,
      bultoIndex: bultoNum,
      boxPhotos,
    });
  } catch (error: any) {
    console.error('[API upload-box-photos] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

// DELETE: Eliminar foto de bulto
export async function DELETE(req: NextRequest) {
  try {
    const { orderId, bultoIndex } = await req.json();

    if (!orderId || !bultoIndex) {
      return NextResponse.json({ error: 'Falta orderId o bultoIndex' }, { status: 400 });
    }

    const order = await serverGetDocument(ORDERS_COLLECTION_ID, orderId) as any;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    if (order.STATUS !== 'shipped') {
      return NextResponse.json({ error: 'Solo se pueden modificar pedidos embalados' }, { status: 409 });
    }

    let boxPhotos = parseBoxPhotos(order.BOXPHOTOS);
    const bultoNum = parseInt(bultoIndex, 10);
    boxPhotos = boxPhotos.filter(p => p.bulto !== bultoNum);

    await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
      BOXPHOTOS: JSON.stringify(boxPhotos),
      UPDATEDAT: Date.now(),
    });

    try { revalidateTag('orders'); } catch {}

    return NextResponse.json({ success: true, boxPhotos });
  } catch (error: any) {
    console.error('[API upload-box-photos DELETE] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

// PATCH: Actualizar cantidad de bultos
export async function PATCH(req: NextRequest) {
  try {
    const { orderId, bultoCount } = await req.json();
    const normalizedCount = Number(bultoCount);

    if (!orderId || !Number.isInteger(normalizedCount) || normalizedCount < 1) {
      return NextResponse.json({ error: 'orderId y bultoCount (>=1) requeridos' }, { status: 400 });
    }

    if (normalizedCount > 10) {
      return NextResponse.json({ error: 'Máximo 10 bultos' }, { status: 400 });
    }

    const order = await serverGetDocument(ORDERS_COLLECTION_ID, orderId) as any;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    if (order.STATUS !== 'shipped') {
      return NextResponse.json({ error: 'Solo se pueden modificar pedidos embalados' }, { status: 409 });
    }
    const boxPhotos = parseBoxPhotos(order.BOXPHOTOS).filter(photo => photo.bulto <= normalizedCount);
    const boxSizes = Array.isArray(order.BOXSIZES) && order.BOXSIZES.length === normalizedCount
      ? order.BOXSIZES
      : [];

    await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
      BULTOCOUNT: normalizedCount,
      BOXSIZES: boxSizes,
      BOXPHOTOS: JSON.stringify(boxPhotos),
      UPDATEDAT: Date.now(),
    });

    try { revalidateTag('orders'); } catch {}

    return NextResponse.json({ success: true, bultoCount: normalizedCount, boxPhotos });
  } catch (error: any) {
    console.error('[API upload-box-photos PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
