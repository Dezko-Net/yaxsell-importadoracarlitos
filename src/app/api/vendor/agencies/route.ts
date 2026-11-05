import { NextRequest, NextResponse } from 'next/server';
import { Query } from '@/lib/db';
import { getActiveVendorSession } from '@/lib/vendor-auth';
import { serverListDocuments, serverGetDocument, serverUpdateDocument } from '@/lib/db-server';
import { AGENCIES_COLLECTION_ID, VENDORS_COLLECTION_ID } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    const [agencyResult, vendor] = await Promise.all([
      serverListDocuments(AGENCIES_COLLECTION_ID, [Query.limit(100)]),
      serverGetDocument(VENDORS_COLLECTION_ID, session.vendorId) as Promise<any>,
    ]);
    const agencies = (agencyResult.documents as any[]).filter(a => a.active !== false).map(a => ({
      id: a.$id, name: a.name, color: a.color || '#3483fa', bg: a.bg || '#e8f0fe', desc: a.desc || '', logo: a.logo || '', active: a.active ?? true,
    }));
    let selectedIds: string[] = [];
    if (vendor.VISIBLE_AGENCIES !== undefined && vendor.VISIBLE_AGENCIES !== null && vendor.VISIBLE_AGENCIES !== '') {
      try { selectedIds = Array.isArray(vendor.VISIBLE_AGENCIES) ? vendor.VISIBLE_AGENCIES : JSON.parse(vendor.VISIBLE_AGENCIES); } catch {}
    }
    return NextResponse.json({ agencies, selectedIds });
  } catch (error: any) {
    console.error('[vendor/agencies GET]', error);
    return NextResponse.json({ error: 'No se pudieron cargar las agencias' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getActiveVendorSession(req);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    const body = await req.json();
    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds.map(String) : [];
    await serverUpdateDocument(VENDORS_COLLECTION_ID, session.vendorId, {
      VISIBLE_AGENCIES: JSON.stringify([...new Set(selectedIds)]),
      UPDATEDAT: Date.now(),
    });
    return NextResponse.json({ ok: true, selectedIds: [...new Set(selectedIds)] });
  } catch (error: any) {
    console.error('[vendor/agencies PUT]', error);
    return NextResponse.json({ error: 'No se pudieron guardar las agencias' }, { status: 500 });
  }
}
