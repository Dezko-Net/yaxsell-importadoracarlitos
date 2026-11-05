import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getAdminDb, SEQUENCES_COLLECTION } from '@/lib/db-server';

const TEMPLATE_KEY = 'store_template';

const noStoreHeaders = {
  'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
};

// Global in-memory cache (60 minutes, updated in-place on POST)
const gTemplates = globalThis as unknown as {
  __yaxsellTemplatesCache?: { data: any; ts: number };
};
const TEMPLATE_CACHE_TTL = 60 * 60 * 1000;

/** Helper: write a single key to sequences collection (upsert) */
async function writeKey(key: string, value: number): Promise<boolean> {
  try {
    const db = getAdminDb();
    const snap = await db.collection(SEQUENCES_COLLECTION).where('key', '==', key).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({ value });
      return true;
    }
    await db.collection(SEQUENCES_COLLECTION).add({ key, value });
    return true;
  } catch (e) {
    console.error('writeKey error:', e);
    return false;
  }
}

const getCachedTemplates = unstable_cache(
  async () => {
    const sections = ['landing', 'collections', 'catalog', 'productDetail', 'cart', 'checkout'] as const;
    const allKeys = [TEMPLATE_KEY, ...sections.map(sec => `${TEMPLATE_KEY}_${sec}`)];
    const keyMap = new Map<string, number>();

    try {
      const db = getAdminDb();
      const snap = await db.collection(SEQUENCES_COLLECTION).where('key', 'in', allKeys).get();
      snap.forEach((docSnap: any) => {
        const d = docSnap.data() || {};
        if (d.key) keyMap.set(String(d.key), Number(d.value) || 0);
      });
    } catch (e) {
      console.error('getCachedTemplates batch query error:', e);
    }

    const global = keyMap.get(TEMPLATE_KEY) || 25;
    const result: Record<string, number> = { landing: 25, collections: 3, catalog: 3, productDetail: 3, cart: 3, checkout: 3 };
    sections.forEach((sec) => {
      const val = keyMap.get(`${TEMPLATE_KEY}_${sec}`);
      if (val) result[sec] = val;
    });

    return { template: global, sections: result };
  },
  ['templates-cache-v2'],
  { revalidate: 3600, tags: ['templates'] }
);

export async function GET(req: NextRequest) {
  try {
    const section = req.nextUrl.searchParams.get('section');
    const cached = gTemplates.__yaxsellTemplatesCache;
    let templates = (cached && Date.now() - cached.ts < TEMPLATE_CACHE_TTL)
      ? cached.data
      : null;

    if (!templates) {
      templates = await getCachedTemplates();
      gTemplates.__yaxsellTemplatesCache = { data: templates, ts: Date.now() };
    }

    if (section) {
      const global = templates.template;
      const val = templates.sections[section] || global;
      return NextResponse.json({ template: val, section }, { headers: noStoreHeaders });
    }

    return NextResponse.json(templates, { headers: noStoreHeaders });
  } catch (error: any) {
    console.error('[API template] Exception:', error);
    return NextResponse.json({ template: 25, sections: { landing: 25, collections: 3, catalog: 3, productDetail: 3, cart: 3, checkout: 3 }, error: error.message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const template = Number(body.template);
    const section = body.section as string | undefined;

    if (!template || template < 1) {
      return NextResponse.json({ success: false, error: 'Invalid template id' }, { status: 400 });
    }

    const key = section ? `${TEMPLATE_KEY}_${section}` : TEMPLATE_KEY;
    const ok = await writeKey(key, template);

    if (!ok) {
      return NextResponse.json({ success: false, error: 'Failed to write template' }, { status: 500 });
    }

    if (gTemplates.__yaxsellTemplatesCache?.data) {
      const next = {
        ...gTemplates.__yaxsellTemplatesCache.data,
        sections: { ...(gTemplates.__yaxsellTemplatesCache.data.sections || {}) },
      };
      if (section) {
        next.sections[section] = template;
      } else {
        next.template = template;
      }
      gTemplates.__yaxsellTemplatesCache = { data: next, ts: Date.now() };
    } else {
      gTemplates.__yaxsellTemplatesCache = undefined;
    }
    try { revalidateTag('templates'); } catch {}

    return NextResponse.json({ success: true, template, section: section || null }, { headers: noStoreHeaders });
  } catch (error: any) {
    console.error('[API template POST] Exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
