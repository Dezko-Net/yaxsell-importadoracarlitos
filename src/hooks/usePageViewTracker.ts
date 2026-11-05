'use client';

import { useEffect } from 'react';
import { getServices, getFirebaseConfig } from '@/lib/db';
import { Query, ID, Permission, Role } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';

const PAGE_VIEWS_COLLECTION = 'page_views';

// Rutas que NO se trackean (admin, api, etc.)
const IGNORED_PREFIXES = ['/admin', '/api', '/_next', '/inventario'];

function shouldTrack(path: string): boolean {
  return !IGNORED_PREFIXES.some(p => path.startsWith(p));
}

// Obtener IP y geolocalización del visitante
async function getGeoInfo(): Promise<{ ip: string; comuna: string; region: string; lat: number; lng: number }> {
  try {
    const res = await fetch('/api/geo', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return {
        ip: data.ip || 'unknown',
        comuna: data.comuna || '',
        region: data.region || '',
        lat: data.lat || 0,
        lng: data.lng || 0,
      };
    }
  } catch {}
  return { ip: 'unknown', comuna: '', region: '', lat: 0, lng: 0 };
}

// Hash simple para no guardar IPs en texto plano
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

/**
 * Registra una visita única por IP por día en la página actual.
 * Solo trackea páginas del frontend (ignora /admin, /api, etc.)
 */
const trackedPages = new Set<string>();

export function usePageViewTracker() {
  const { user } = useAuth();
  useEffect(() => {
    // Page views tracking is disabled temporarily to save Appwrite requests quota
    return;
    const track = async () => {
      const page = window.location.pathname || '/';
      if (!shouldTrack(page)) return;

      // Synchronous checks to prevent race conditions
      const sessionKey = `tracked_page_${page}`;
      if (trackedPages.has(sessionKey)) return;
      if (sessionStorage.getItem(sessionKey)) return;

      // Lock synchronously BEFORE any async calls
      trackedPages.add(sessionKey);
      sessionStorage.setItem(sessionKey, '1');

      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const date = new Date().toISOString().slice(0, 10);

        // Obtener geo info
        const geo = await getGeoInfo();
        const ipHash = simpleHash(geo.ip + date);

        // Nombre del usuario si está logueado
        const userName = user?.name || '';

        // Verificar si esta IP ya visitó esta página hoy
        const existing = await databases.listDocuments(databaseId, PAGE_VIEWS_COLLECTION, [
          Query.equal('PAGE', page),
          Query.equal('DATE', date),
          Query.equal('IP', ipHash),
          Query.limit(1),
        ]);

        if (existing.documents.length > 0) {
          // Ya visitó hoy → actualizar nombre si se logueó después
          if (userName) {
            const doc = existing.documents[0];
            if (!(doc as any).USER_NAME) {
              await databases.updateDocument(databaseId, PAGE_VIEWS_COLLECTION, doc.$id, {
                USER_NAME: userName,
              });
            }
          }
          return;
        }

        // Primera visita de esta IP hoy → crear registro
        await databases.createDocument(databaseId, PAGE_VIEWS_COLLECTION, ID.unique(), {
          PAGE: page,
          DATE: date,
          VIEWS: 1,
          IP: ipHash,
          COMUNA: geo.comuna,
          REGION: geo.region,
          LAT: geo.lat,
          LNG: geo.lng,
          USER_NAME: userName,
        }, [
          Permission.read(Role.any()),
          Permission.write(Role.any()),
        ]);
      } catch (e: any) {
        console.warn('[page-view-tracker] Warning (handled gracefully):', e?.message || e);
        // Optionally remove lock if failed to allow retry, but better to prevent spam.
      }
    };

    track();
  }, [user?.id]);
}

/**
 * Obtiene estadísticas de visitas para el dashboard.
 * Solo cuenta páginas del frontend.
 */
interface PageViewStatsResult {
  totalViews: number;
  uniquePages: number;
  viewsByDay: Record<string, number>;
  topPages: { page: string; views: number }[];
  todayViews: number;
  topComunas: { comuna: string; count: number; lat: number; lng: number }[];
  visitorMarkers: { comuna: string; region: string; lat: number; lng: number; count: number; users: string[] }[];
  days: number;
}

const statsCache = new Map<string, { data: PageViewStatsResult; timestamp: number }>();
const statsInFlight = new Map<string, Promise<PageViewStatsResult>>();
const STATS_CACHE_TTL = 15 * 60 * 1000;

export async function getPageViewStats(days = 30): Promise<PageViewStatsResult> {
  const uid = auth.currentUser?.uid || '';
  const cacheKey = `${uid}:${days}`;
  const cached = statsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) return cached.data;
  if (uid && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`admin_pageview_stats_v1:${cacheKey}`);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.data && Number(saved.timestamp) > 0 && Date.now() - Number(saved.timestamp) < STATS_CACHE_TTL) {
        statsCache.set(cacheKey, saved);
        return saved.data;
      }
    } catch {}
  }
  const existing = statsInFlight.get(cacheKey);
  if (existing) return existing;

  const pending = fetchPageViewStats(days, cacheKey, uid);
  statsInFlight.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    if (statsInFlight.get(cacheKey) === pending) statsInFlight.delete(cacheKey);
  }
}

async function fetchPageViewStats(days: number, cacheKey: string, uid: string): Promise<PageViewStatsResult> {
  const { databases } = getServices();
  const { databaseId } = getFirebaseConfig();

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const all: { PAGE: string; DATE: string; VIEWS: number; COMUNA: string; REGION: string; LAT: number; LNG: number; USER_NAME: string }[] = [];
  let complete = true;

  try {
    const queries: any[] = [
      Query.limit(200),
      Query.greaterThanEqual('DATE', sinceStr),
      Query.orderDesc('$createdAt') // Start with newest first
    ];
    const res = await databases.listDocuments(databaseId, PAGE_VIEWS_COLLECTION, queries);
    const docs = res.documents.map(d => ({
      PAGE: (d as any).PAGE || '/',
      DATE: (d as any).DATE || '',
      VIEWS: (d as any).VIEWS || 0,
      COMUNA: (d as any).COMUNA || '',
      REGION: (d as any).REGION || '',
      LAT: (d as any).LAT || 0,
      LNG: (d as any).LNG || 0,
      USER_NAME: (d as any).USER_NAME || '',
    }));
    all.push(...docs);
  } catch (e) {
    console.error("Error fetching stats page:", e);
    complete = false;
  }

  // Filtrar por fecha y solo frontend
  const filtered = all.filter(d => d.DATE >= sinceStr && shouldTrack(d.PAGE));

  const totalViews = filtered.length;
  const uniquePages = new Set(filtered.map(d => d.PAGE)).size;

  // Visitas por día
  const viewsByDay: Record<string, number> = {};
  filtered.forEach(d => {
    viewsByDay[d.DATE] = (viewsByDay[d.DATE] || 0) + 1;
  });

  // Top páginas
  const viewsByPage: Record<string, number> = {};
  filtered.forEach(d => {
    viewsByPage[d.PAGE] = (viewsByPage[d.PAGE] || 0) + 1;
  });
  const topPages = Object.entries(viewsByPage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([page, views]) => ({ page, views }));

  // Visitas de hoy
  const today = new Date().toISOString().slice(0, 10);
  const todayViews = filtered.filter(d => d.DATE === today).length;

  // Top comunas
  const viewsByComuna: Record<string, { count: number; lat: number; lng: number }> = {};
  filtered.forEach(d => {
    if (d.COMUNA) {
      if (!viewsByComuna[d.COMUNA]) viewsByComuna[d.COMUNA] = { count: 0, lat: d.LAT, lng: d.LNG };
      viewsByComuna[d.COMUNA].count++;
    }
  });
  const topComunas = Object.entries(viewsByComuna)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([comuna, data]) => ({ comuna, count: data.count, lat: data.lat, lng: data.lng }));

  // Marcadores para el mapa (últimas 24h, con coords)
  const last24h = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const mapMarkers = filtered
    .filter(d => d.DATE >= last24h && d.LAT && d.LNG)
    .reduce((acc, d) => {
      const key = d.COMUNA || `${d.LAT},${d.LNG}`;
      if (!acc[key]) acc[key] = { comuna: d.COMUNA, region: d.REGION, lat: d.LAT, lng: d.LNG, count: 0, users: [] };
      acc[key].count++;
      if (d.USER_NAME && !acc[key].users.includes(d.USER_NAME)) acc[key].users.push(d.USER_NAME);
      return acc;
    }, {} as Record<string, { comuna: string; region: string; lat: number; lng: number; count: number; users: string[] }>);
  const visitorMarkers = Object.values(mapMarkers);

  const result = { totalViews, uniquePages, viewsByDay, topPages, todayViews, topComunas, visitorMarkers, days: filtered.length };
  
  if (complete && (auth.currentUser?.uid || '') === uid) {
    const entry = { data: result, timestamp: Date.now() };
    statsCache.set(cacheKey, entry);
    if (uid && typeof window !== 'undefined') {
      try { sessionStorage.setItem(`admin_pageview_stats_v1:${cacheKey}`, JSON.stringify(entry)); } catch {}
    }
  }

  return result;
}
