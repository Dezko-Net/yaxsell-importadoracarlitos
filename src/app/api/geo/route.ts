import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';

    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { 'User-Agent': 'nodejs' },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        ip: data.ip || ip,
        comuna: data.city || data.region || '',
        region: data.region || '',
        lat: data.latitude || 0,
        lng: data.longitude || 0,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
  } catch {}

  return NextResponse.json({ ip: 'unknown', comuna: '', region: '', lat: 0, lng: 0 });
}
