import { NextResponse } from 'next/server';
import { AI_ENABLED } from '@/lib/feature-flags';
import { getKeniaConfig } from '@/lib/kenia-runtime';
import { unstable_cache } from 'next/cache';

const getCachedKeniaStatus = unstable_cache(
  async () => {
    const config = await getKeniaConfig();
    return { isEnabled: config.isEnabled !== false };
  },
  ['kenia-status-key'],
  { revalidate: 86400, tags: ['kenia-status'] } // Cache for 24 hours
);

export async function GET() {
  if (!AI_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const status = await getCachedKeniaStatus();
    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
    });
  } catch (e: any) {
    return NextResponse.json({ isEnabled: true });
  }
}
