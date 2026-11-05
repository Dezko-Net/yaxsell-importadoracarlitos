import { NextRequest, NextResponse } from 'next/server';
import { serverCreateDocument } from '@/lib/db-server';
import { CATEGORIES_COLLECTION_ID } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { name, description, icon, parentId } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'name es requerido' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {
      name: name.trim(),
      iconUrl: icon || '',
      order: 0,
    };

    const result = await serverCreateDocument(CATEGORIES_COLLECTION_ID, 'unique()', data);

    return NextResponse.json({
      success: true,
      category: result,
      message: `Categoría "${name}" creada exitosamente`,
    });
  } catch (error: any) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al crear la categoría' },
      { status: 500 }
    );
  }
}
