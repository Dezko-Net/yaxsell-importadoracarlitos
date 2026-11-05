import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
    }

    // Strip mode=admin if present
    const cleanUrl = url.replace(/&?mode=admin/, '').replace(/\?mode=admin/, '?').replace(/\?$/, '');

    // Extract project ID from Appwrite URL query param if present
    let projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'yaxselldemo';
    const urlObj = new URL(cleanUrl);
    const urlProject = urlObj.searchParams.get('project');
    if (urlProject) projectId = urlProject;

    const headers: Record<string, string> = {};
    if (cleanUrl.includes('cloud.appwrite.io') || cleanUrl.includes('/storage/buckets/')) {
      headers['X-Appwrite-Project'] = projectId;
      const API_KEY = process.env.APPWRITE_API_KEY || '';
      if (API_KEY) headers['X-Appwrite-Key'] = API_KEY;
    }

    const res = await fetch(cleanUrl, { headers });

    if (!res.ok) {
      console.warn('[image-proxy] fetch failed:', res.status, cleanUrl.substring(0, 100));
      // Devolver imagen transparente 1x1 en vez de error 500
      const transparentPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      return new NextResponse(transparentPixel, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache',
        },
      });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'CDN-Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
    console.error('[image-proxy] error:', error.message);
    // Devolver imagen transparente 1x1 en vez de error 500
    const transparentPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    return new NextResponse(transparentPixel, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    });
  }
}
