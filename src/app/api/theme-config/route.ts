import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { serverGetDocument, serverCreateDocument, serverUpdateDocument, serverDeleteDocument, THEME_CONFIG_COLLECTION } from '@/lib/db-server';

const DOC_ID = 'homepage_sections';

let memoryCacheThemeConfig: { sections: string; ts: number } | null = null;
const THEME_CONFIG_TTL = 60 * 60 * 1000;

const getCachedThemeConfig = unstable_cache(
  async () => {
    try {
      const doc = await serverGetDocument(THEME_CONFIG_COLLECTION, DOC_ID) as any;
      return { sections: doc?.SECTIONS || doc?.sections || '[]' };
    } catch {
      return null;
    }
  },
  ['theme-config-cache-v1'],
  { revalidate: 86400, tags: ['theme-config'] }
);

// GET - Obtener configuración
export async function GET() {
  try {
    if (memoryCacheThemeConfig && Date.now() - memoryCacheThemeConfig.ts < THEME_CONFIG_TTL) {
      return NextResponse.json(
        { success: true, sections: memoryCacheThemeConfig.sections },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' } },
      );
    }

    const cached = await getCachedThemeConfig();

    if (cached) {
      memoryCacheThemeConfig = { sections: cached.sections, ts: Date.now() };
      return NextResponse.json(
        { success: true, sections: cached.sections },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' } },
      );
    }

    // Documento no existe, crear vacío
    await serverCreateDocument(THEME_CONFIG_COLLECTION, DOC_ID, {
      NAME: 'homepage_sections',
      SECTIONS: '[]',
    });

    memoryCacheThemeConfig = { sections: '[]', ts: Date.now() };
    revalidateTag('theme-config');

    return NextResponse.json(
      { success: true, sections: '[]' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error: any) {
    console.error('[API theme-config] Exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST - Guardar configuración
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sections = typeof body.sections === 'string' ? body.sections : JSON.stringify(body.sections);

    try {
      await serverUpdateDocument(THEME_CONFIG_COLLECTION, DOC_ID, { SECTIONS: sections });
      memoryCacheThemeConfig = { sections, ts: Date.now() };
      revalidateTag('theme-config');
      return NextResponse.json(
        { success: true },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
      );
    } catch {
      // Si no existe, crear
      await serverCreateDocument(THEME_CONFIG_COLLECTION, DOC_ID, { SECTIONS: sections });
      memoryCacheThemeConfig = { sections, ts: Date.now() };
      revalidateTag('theme-config');
      return NextResponse.json(
        { success: true },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
      );
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE - Resetear configuración
export async function DELETE() {
  try {
    await serverDeleteDocument(THEME_CONFIG_COLLECTION, DOC_ID);
    memoryCacheThemeConfig = null;
    revalidateTag('theme-config');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
