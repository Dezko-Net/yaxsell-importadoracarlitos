import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DISABLED_MODULE_PATHS, moduleForPath, normalizeServiceModules } from '@/lib/module-access';

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

export async function middleware(request: NextRequest) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();

  // robots.txt y sitemap.xml SIEMPRE accesibles: cualquier bot debe poder
  // leerlos (son baratos: estático + cacheado 24h, cero lecturas a Appwrite).
  const pathname = request.nextUrl.pathname;
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    return NextResponse.next();
  }

  // Esta lectura pública también la usa el propio middleware. No debe ser
  // rechazada por el filtro de user-agent de los clientes HTTP internos.
  if (pathname === '/api/module-access' && request.method === 'GET') {
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

  const module = moduleForPath(pathname);
  if (module) {
    try {
      let value: unknown;
      let lastError: unknown;
      let loaded = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(new URL('/api/module-access', request.url), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error(`module-access HTTP ${response.status}`);
          const data = await response.json();
          value = data.modules;
          if (!value || typeof value !== 'object' || !['web', 'erp', 'pos'].every(key => typeof (value as Record<string, unknown>)[key] === 'boolean')) {
            throw new Error('module-access respuesta inválida');
          }
          loaded = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!loaded) throw lastError ?? new Error('module-access sin respuesta');
      const modules = normalizeServiceModules(value);
      // POS comparte algunas APIs de configuración y de inventario con el ERP.
      const sharedPosApi = modules.pos && (pathname.startsWith('/api/admin-supreme/') || pathname.startsWith('/api/erp/'));
      if (!modules[module] && !sharedPosApi) {
        if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Módulo desactivado' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
        const redirect = NextResponse.redirect(new URL('/admin/login?reason=module-disabled', request.url));
        redirect.headers.set('Cache-Control', 'no-store');
        return redirect;
      }
    } catch (error) {
      console.warn('[module-access] Falló la consulta de servicios:', error instanceof Error ? `${error.name}: ${error.message}` : 'error desconocido');
      return new NextResponse('No se pudo comprobar el estado de los servicios.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
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
