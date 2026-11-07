import type { NextConfig } from 'next';

process.env.TZ = 'America/Santiago';

const nextConfig: NextConfig = {
  // Cada servidor local puede usar su propia compilación para no pisar los chunks.
  ...(process.env.NEXT_DEV_DIST_DIR ? { distDir: process.env.NEXT_DEV_DIST_DIR } : {}),
  typescript: {
    // Temporal durante migración Appwrite → Firebase
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    'firebase-admin',
    '@google-cloud/storage',
    '@google-cloud/firestore',
    'gcp-metadata',
    'google-auth-library',
    '@fastify/busboy',
    'google-gax',
    'google-logging-utils',
    '@sparticuz/chromium',
    'puppeteer-core',
    'puppeteer',
  ],
  outputFileTracingIncludes: {
    '/api/whatsapp/webhook': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/catalogo/upload-proof': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/public-data/vendor-order/[id]/upload-proof': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Evitar que firebase-admin y sus dependencias nativas
      // se intenten bundlear para el cliente (browser)
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        http2: false,
        dns: false,
        os: false,
        path: false,
        stream: false,
        crypto: false,
        zlib: false,
        events: false,
        process: false,
        'node:events': false,
        'node:process': false,
        'node:stream': false,
        'node:crypto': false,
        'node:buffer': false,
        'node:path': false,
        'node:os': false,
        'node:net': false,
        'node:tls': false,
        'node:http': false,
        'node:https': false,
        'node:fs': false,
        'node:fs/promises': false,
        'node:child_process': false,
      };

      // Reemplazar esquema node: → nombre sin prefijo para que webpack
      // lo encuentre en resolve.fallback (que es false = no bundlear)
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: any) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
    }
    return config;
  },
  images: {
    remotePatterns: [
      ...(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? [
        { protocol: 'https' as const, hostname: 'firebasestorage.googleapis.com', pathname: `/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/**` },
        { protocol: 'https' as const, hostname: 'storage.googleapis.com', pathname: `/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/**` },
      ] : []),
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/importadora-carlitos.firebasestorage.app/**' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/yaxselldemo.firebasestorage.app/**' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/asistoraerp.firebasestorage.app/**' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/geminai-449212.firebasestorage.app/**' },
      { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/yaxselldemo.firebasestorage.app/**' },
      { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/asistoraerp.firebasestorage.app/**' },
      { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/geminai-449212.firebasestorage.app/**' },
    ],
    // Reducir tamaño de imágenes optimizadas para ahorrar bandwidth
    formats: ['image/webp'],
    minimumCacheTTL: 86400,
  },
  async redirects() {
    return [
      {
        source: '/catalogo',
        destination: '/productos',
        permanent: true,
      },
      {
        source: '/cuenta/favoritos',
        destination: '/favoritos',
        permanent: false,
      },
      
    ];
  },
  async headers() {
    return [
      {
        // Static assets & Next.js chunks - Cache público e inmutable en Vercel CDN
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: process.env.NODE_ENV === 'development'
              ? 'no-store, must-revalidate'
              : 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // API routes - caché de navegador largo + CDN largo
        // s-maxage=3600: CDN cachea 1h
        // max-age=300: navegador cachea 5min
        // stale-while-revalidate=86400: sirve stale hasta 24h mientras revalida
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      ...['/api/web-client-config', '/api/admin/web-client-config', '/api/catalogo/firebase-config'].map(source => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      })),
      {
        // Páginas HTML - caché de navegador largo + CDN largo
        source: '/((?!_next|api|favicon.ico).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
