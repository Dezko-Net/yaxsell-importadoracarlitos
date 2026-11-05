import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

const getVersion = unstable_cache(async () => { return { version: Date.now().toString() }; }, ['catalog-version-v3'], { tags: ['products', 'catalog'] });

export async function GET() {
  const data = await getVersion();
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store'
    }
  });
}