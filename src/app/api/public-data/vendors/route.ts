import { NextResponse } from 'next/server';
import { getPublicVendors } from '@/lib/public-vendor-cache';

export async function GET() {
  try {
    const vendors = await getPublicVendors();
    return NextResponse.json({ vendors }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
      }
    });
  } catch (error: any) {
    console.error('[API public-data/vendors] Error in getCachedVendors:', error);
    return NextResponse.json({ vendors: [] }, { status: 200 });
  }
}
