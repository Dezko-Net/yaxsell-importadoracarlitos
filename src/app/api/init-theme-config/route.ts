import { NextResponse } from 'next/server';
import { serverGetDocument, serverCreateDocument, THEME_CONFIG_COLLECTION } from '@/lib/db-server';

export async function GET() {
  const docId = 'homepage_sections';

  try {
    try {
      const existing = await serverGetDocument(THEME_CONFIG_COLLECTION, docId);
      return NextResponse.json({
        success: true,
        message: 'Theme config ya existe',
        document: existing,
      });
    } catch {
      // Documento no existe, crearlo
    }

    await serverCreateDocument(THEME_CONFIG_COLLECTION, docId, { sections: '[]' });

    return NextResponse.json({
      success: true,
      message: 'Theme config creado exitosamente',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Error desconocido',
    }, { status: 500 });
  }
}
