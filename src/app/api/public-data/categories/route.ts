import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db-server';
import { CATEGORIES_COLLECTION_ID } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const snapshot = await getAdminDb().collection(CATEGORIES_COLLECTION_ID).limit(500).get();
    const documents = snapshot.docs.map(doc => {
      const value = doc.data();
      return { $id: doc.id, name: String(value.name || value.NAME || '').trim() };
    }).filter(doc => doc.name);
    return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[categories] No se pudieron leer las categorías:', error);
    return NextResponse.json({ error: 'No se pudieron cargar las categorías.' }, { status: 500 });
  }
}
