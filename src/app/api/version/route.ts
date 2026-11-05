import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { serverGetDocument, THEME_CONFIG_COLLECTION } from '@/lib/db-server';

const DOC_ID = 'homepage_sections';

// GET - Returns the last updated timestamp of the theme config
// Clients poll this to detect when admin has made changes
const getCachedVersion = unstable_cache(
  async () => {
    try {
      const doc = await serverGetDocument(THEME_CONFIG_COLLECTION, DOC_ID) as any;
      const raw = doc?.$updatedAt || doc?.UPDATEDAT || doc?._updatedAt;
      return { updatedAt: raw ? new Date(raw).getTime() : 0 };
    } catch {
      return { updatedAt: 0 };
    }
  },
  ['theme-version-cache-v1'],
  { revalidate: 86400, tags: ['theme-config'] }
);

export async function GET() {
  try {
    const cached = await getCachedVersion();

    return NextResponse.json(
      { updatedAt: cached.updatedAt },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { updatedAt: 0 },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  }
}
