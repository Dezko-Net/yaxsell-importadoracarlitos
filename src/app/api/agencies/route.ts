import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, unstable_cache, revalidateTag } from 'next/cache';
import { getAdminDb } from '@/lib/db-server';

const COLLECTION_ID = 'shipping_agencies';
const VENDORS_COLLECTION_ID = 'vendors';

const gAgencies = globalThis as unknown as {
  __yaxsellAgenciesCache?: { data: any[]; ts: number };
};
const AGENCIES_MEMORY_TTL = 60 * 60 * 1000;

const getCachedAgencies = unstable_cache(
  async () => {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION_ID).limit(100).get();

    return snap.docs
      .filter(doc => doc.data().active !== false)
      .map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name,
          color: d.color || '#3483fa',
          bg: d.bg || '#e8f0fe',
          desc: d.desc || '',
          logo: d.logo || '',
          active: d.active ?? true,
        };
      });
  },
  ['shipping-agencies-cache-v4'],
  { revalidate: 86400, tags: ['agencies'] }
);

export async function GET(req: NextRequest) {
  try {
    const now = Date.now();
    let agencies = (gAgencies.__yaxsellAgenciesCache && now - gAgencies.__yaxsellAgenciesCache.ts < AGENCIES_MEMORY_TTL)
      ? gAgencies.__yaxsellAgenciesCache.data
      : null;

    if (!agencies) {
      agencies = await getCachedAgencies();
      gAgencies.__yaxsellAgenciesCache = { data: agencies || [], ts: now };
    }

    const vendorId = new URL(req.url).searchParams.get('vendorId');
    if (!vendorId || vendorId === '__MAIN__') return NextResponse.json({ agencies }, {
      headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400' }
    });

    const db = getAdminDb();
    const vendorSnap = await db.collection(VENDORS_COLLECTION_ID).doc(vendorId).get();
    const vendor = vendorSnap.data() as any;
    if (!vendor || vendor.VISIBLE_AGENCIES === undefined || vendor.VISIBLE_AGENCIES === null || vendor.VISIBLE_AGENCIES === '') {
      return NextResponse.json({ agencies }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    let visibleIds: string[] = [];
    try { visibleIds = Array.isArray(vendor.VISIBLE_AGENCIES) ? vendor.VISIBLE_AGENCIES : JSON.parse(vendor.VISIBLE_AGENCIES); } catch {}
    const filtered = agencies.filter((agency: any) => visibleIds.includes(agency.id));
    return NextResponse.json({ agencies: filtered }, {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (e: any) {
    console.error('Error fetching agencies:', e?.message);
    return NextResponse.json({ agencies: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agencies } = body as { agencies: Array<{ id?: string; name: string; color: string; bg: string; desc: string; logo: string; active: boolean }> };

    if (!Array.isArray(agencies)) {
      return NextResponse.json({ error: 'agencies must be an array' }, { status: 400 });
    }

    const db = getAdminDb();
    const existingSnap = await db.collection(COLLECTION_ID).limit(100).get();
    const existingIds = new Set(existingSnap.docs.map(d => d.id));
    const incomingIds = new Set(agencies.filter(a => a.id).map(a => a.id));

    // Delete removed agencies
    for (const doc of existingSnap.docs) {
      if (!incomingIds.has(doc.id)) {
        try { await doc.ref.delete(); } catch {}
      }
    }

    // Create or update
    const results: any[] = [];
    for (const agency of agencies) {
      const payload = {
        name: agency.name,
        color: agency.color || '#3483fa',
        bg: agency.bg || '#e8f0fe',
        desc: agency.desc || '',
        logo: agency.logo || '',
        active: agency.active ?? true,
      };

      try {
        if (agency.id && existingIds.has(agency.id)) {
          await db.collection(COLLECTION_ID).doc(agency.id).update(payload);
          results.push({ id: agency.id, ...payload });
        } else {
          const ref = await db.collection(COLLECTION_ID).add(payload);
          results.push({ id: ref.id, ...payload });
        }
      } catch (e: any) {
        console.error('Error upserting agency:', agency.name, e?.message);
      }
    }

    gAgencies.__yaxsellAgenciesCache = {
      data: results.filter(a => a.active !== false),
      ts: Date.now(),
    };
    try { revalidatePath('/api/agencies'); } catch {}
    try { revalidatePath('/api/agencias'); } catch {}
    try { revalidateTag('agencies'); } catch {}

    return NextResponse.json({ success: true, agencies: results });
  } catch (e: any) {
    console.error('Error saving agencies:', e?.message);
    return NextResponse.json({ error: e?.message || 'Error saving agencies' }, { status: 500 });
  }
}
