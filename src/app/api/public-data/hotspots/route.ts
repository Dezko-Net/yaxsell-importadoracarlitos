import { NextResponse } from 'next/server';
import { getServices, getFirebaseConfig, HOTSPOT_PANELS_COLLECTION } from '@/lib/db';
import { Query } from '@/lib/db';
import { unstable_cache } from 'next/cache';

// force-dynamic removed to allow Vercel CDN caching via s-maxage header

let memoryCacheHotspots: any[] | null = null;
let memoryCacheHotspotsTime = 0;

const getCachedHotspots = unstable_cache(
  async () => {
    const now = Date.now();
    if (memoryCacheHotspots && (now - memoryCacheHotspotsTime < 300000)) {
      return memoryCacheHotspots;
    }

    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const res = await databases.listDocuments(databaseId, HOTSPOT_PANELS_COLLECTION, [
      Query.equal('ISACTIVE', true),
      Query.orderAsc('CELLINDEX'),
      Query.limit(50)
    ]);

    memoryCacheHotspots = res.documents;
    memoryCacheHotspotsTime = now;
    return res.documents;
  },
  ['public-hotspots-cache'],
  { revalidate: 3600, tags: ['hotspots'] }
);

export async function GET() {
  try {
    const panels = await getCachedHotspots();
    return NextResponse.json({ panels }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300'
      }
    });
  } catch (err) {
    return NextResponse.json({ panels: [] });
  }
}

