import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DISABLED_MODULE_PATHS } from '@/lib/module-access';

// Keywords to identify crawlers, bots, or scraping libraries
const BOT_KEYWORDS = [
  'bot',
  'spider',
  'crawler',
  'scraper',
  'archiver',
  'curl',
  'wget',
  'python',
  'node-fetch',
  'mj12',
  'semrush',
  'ahrefs',
  'screaming frog',
  'pinterest'
];

// Explicitly allow social sharing previews that users might share (e.g. TikTok, WhatsApp, Telegram, Facebook)
const ALLOWED_KEYWORDS = [
  'tiktok',
  'bytespider',
  'whatsapp',
  'telegram',
  'facebookexternalhit',
  'twitterbot',
  'discordbot',
  // 🔍 SEO: buscadores legítimos. OJO: 'bot' está en BOT_KEYWORDS, así que
  // "Googlebot" quedaba bloqueado con 403 → Google no podía indexar la tienda.
  // Los scrapers agresivos (semrush/ahrefs/mj12/curl/python) siguen bloqueados.
  'googlebot',
  'google-inspectiontool', // probador de URL de Search Console
  'adsbot-google',
  'googleother',
  'bingbot',
  'applebot',
  'duckduckbot',
  'asis-app',
];

export function middleware(request: NextRequest) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();

  // robots.txt y sitemap.xml SIEMPRE accesibles: cualquier bot debe poder
  // leerlos (son baratos: estático + cacheado 24h, cero lecturas a Appwrite).
  const pathname = request.nextUrl.pathname;
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    return NextResponse.next();
  }

  const isDisabledModulePath = DISABLED_MODULE_PATHS.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isDisabledModulePath) {
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.json({ error: 'Módulo no disponible' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const response = NextResponse.redirect(new URL('/productos', request.url));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // CORS para sync-firebase-products (catálogo Firebase → Appwrite) en variantes con ERP habilitado.
  // En Carlitos esta ruta ya fue interceptada arriba por el bloqueo del módulo ERP.
  if (pathname === '/api/admin/sync-firebase-products') {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return response;
  }

  const isBot = BOT_KEYWORDS.some(keyword => ua.includes(keyword)) &&
                !ALLOWED_KEYWORDS.some(allowed => ua.includes(allowed));

  if (isBot) {
    console.log(`[Middleware] Blocked bot request. UA: ${request.headers.get('user-agent')} | Path: ${request.nextUrl.pathname}`);
    return new NextResponse('Access Denied (Crawlers Blocked)', { status: 403 });
  }

  const response = NextResponse.next();
  const country = request.headers.get('x-vercel-ip-country');
  if (country) {
    response.cookies.set('user_country', country, { path: '/' });
  }

  // ── Monitor de requests: identifica QUÉ pega a la app (sobre todo de noche).
  // Loguea /api/* (los que pueden disparar lecturas a Appwrite). Filtra en Vercel por "[REQ]".
  // Silenciar con env LOG_REQ=0.
  if (process.env.LOG_REQ !== '0') {
    const path = request.nextUrl.pathname;
    if (path.startsWith('/api/') && !path.startsWith('/api/assets') && !path.startsWith('/api/image')) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '?';
      console.log(`[REQ] ${path}${request.nextUrl.search} | ip:${ip} | ua:${(request.headers.get('user-agent') || '').slice(0, 70)}`);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
