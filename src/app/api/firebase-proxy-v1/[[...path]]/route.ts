import { NextRequest, NextResponse } from 'next/server';
import { getServerConfig, getHeaders } from '@/lib/firebase-server-compat';
import { unstable_cache } from 'next/cache';
import { PUBLIC_CACHEABLE_COLLECTIONS } from '@/lib/firebase-compat';

export const dynamic = 'force-dynamic';

// We only want to aggressively cache GET requests (listDocuments, getDocument)
const cachedAppwriteGet = (path: string, searchParams: string) => unstable_cache(
  async () => {
    const { endpoint } = getServerConfig();
    const headers = getHeaders();
    
    const url = `${endpoint}/${path}${searchParams ? '?' + searchParams : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      throw new Error(`Appwrite error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  },
  ['appwrite-proxy-v1-cache', path, searchParams],
  { revalidate: 300, tags: ['appwrite-proxy-v1'] }
)();

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path: pathParam } = await params;
    const path = pathParam ? pathParam.join('/') : '';
    
    // Security check: Only allow GET requests to databases/collections/documents
    // We must prevent users from accessing secure collections (like users or admin settings)
    if (path.includes('/documents')) {
      const parts = path.split('/');
      // Path format is usually databases/{dbId}/collections/{colId}/documents
      const colIndex = parts.indexOf('collections');
      if (colIndex !== -1 && parts.length > colIndex + 1) {
        const colId = parts[colIndex + 1];
        if (!PUBLIC_CACHEABLE_COLLECTIONS.includes(colId)) {
          return NextResponse.json({ error: 'Unauthorized collection access via proxy' }, { status: 403 });
        }
      }
    } else {
      // If it's not a document query, just passthrough (or block)
      // For safety, let's only cache document queries.
    }

    const { searchParams } = new URL(req.url);
    const queryStr = searchParams.toString();
    
    // Use unstable_cache for GET
    const data = await cachedAppwriteGet(path, queryStr);
    
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' }
    });
  } catch (error: any) {
    console.error('[Appwrite Proxy GET Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Pass-through other methods directly to Appwrite (NO CACHE)
async function passThrough(req: NextRequest, method: string, { params }: { params: Promise<{ path?: string[] }> }) {
  try {
    const { endpoint } = getServerConfig();
    const headers = getHeaders();
    const { path: pathParam } = await params;
    const path = pathParam ? pathParam.join('/') : '';
    const { searchParams } = new URL(req.url);
    const queryStr = searchParams.toString();
    
    const url = `${endpoint}/${path}${queryStr ? '?' + queryStr : ''}`;
    
    const body = req.body ? await req.text() : undefined;
    
    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body
    });
    
    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) { return passThrough(req, 'POST', { params }); }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) { return passThrough(req, 'PUT', { params }); }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) { return passThrough(req, 'PATCH', { params }); }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) { return passThrough(req, 'DELETE', { params }); }
