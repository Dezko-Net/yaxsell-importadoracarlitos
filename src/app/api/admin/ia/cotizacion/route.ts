import { NextRequest, NextResponse } from 'next/server';
import { serverCreateDocument, serverListDocuments, serverGetDocument } from '@/lib/db-server';
import { COTIZACION_COLLECTION_ID } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { products, groups, discountPct, clientName } = await req.json();
    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ success: false, error: 'Faltan productos' }, { status: 400 });
    }

    const doc = await serverCreateDocument(COTIZACION_COLLECTION_ID, 'unique()', {
      products: JSON.stringify(products),
      groups: JSON.stringify(groups || []),
      discountPct: String(discountPct),
      clientName: clientName || '',
      status: 'active',
    });

    return NextResponse.json({ success: true, id: doc.$id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const doc = await serverGetDocument(COTIZACION_COLLECTION_ID, id) as any;
      return NextResponse.json({
        success: true,
        cotizacion: {
          id: doc.$id,
          products: JSON.parse(doc.products || '[]'),
          groups: JSON.parse(doc.groups || '[]'),
          discountPct: Number(doc.discountPct || 20),
          clientName: doc.clientName || '',
          status: doc.status || 'active',
        },
      });
    }
    return NextResponse.json({ success: false, error: 'Falta id' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error' }, { status: 500 });
  }
}
