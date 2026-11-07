import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminDb } from '@/lib/db-server';
import { CATEGORIES_COLLECTION_ID } from '@/lib/db';
import { isWebAdminRequest } from '@/lib/web-admin-request';
import { clearCatalogDataCache } from '@/lib/catalog-data-cache';

export const dynamic = 'force-dynamic';
const keyOf = (name: string) => name.normalize('NFKC').toLocaleLowerCase('es-CL').replace(/\s+/g, ' ').trim();

export async function POST(request: NextRequest) {
  if (!await isWebAdminRequest(request)) return NextResponse.json({ error: 'Acceso al módulo web requerido.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
  if (!name || name.length > 100) return NextResponse.json({ error: 'Escribe una categoría de hasta 100 caracteres.' }, { status: 400 });
  try {
    const db = getAdminDb();
    const collection = db.collection(CATEGORIES_COLLECTION_ID);
    const normalized = keyOf(name);
    const existing = await collection.limit(500).get();
    const found = existing.docs.find(doc => keyOf(String(doc.data().name || doc.data().NAME || '')) === normalized);
    if (found) return NextResponse.json({ ok: true, category: { $id: found.id, name: String(found.data().name || found.data().NAME || name) } });
    const ref = collection.doc(`web_${createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`);
    const savedName = await db.runTransaction(async transaction => {
      const current = await transaction.get(ref);
      if (current.exists) return String(current.data()?.name || name);
      transaction.create(ref, { name, iconUrl: '', color: '', order: 0, BACKGROUND_IMAGE_URL: '' });
      return name;
    });
    clearCatalogDataCache();
    try { revalidateTag('categories'); } catch {}
    return NextResponse.json({ ok: true, category: { $id: ref.id, name: savedName } });
  } catch (error) {
    console.error('[categories] No se pudo crear la categoría:', error);
    return NextResponse.json({ error: 'No se pudo crear la categoría.' }, { status: 500 });
  }
}
