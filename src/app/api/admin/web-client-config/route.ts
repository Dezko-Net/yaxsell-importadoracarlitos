import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/db-server';
import { normalizeWebClientConfig, validateWebClientConfig } from '@/lib/web-client-config';
import { getWebClientConfig, getWebMetaPhoneNumberId, invalidateWebClientConfig } from '@/lib/web-client-config-server';
import { revalidatePath } from 'next/cache';
import { isSupremeOwner } from '@/lib/supreme-owner';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';

export const dynamic = 'force-dynamic';

async function authorized(request: NextRequest) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return false;
    const user = await getAuth(getAdminApp()).verifyIdToken(token);
    return isSupremeOwner(user.uid, user.email);
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ error: 'Acceso restringido.' }, { status: 403 });
  try {
    const [config, metaPhoneNumberId] = await Promise.all([getWebClientConfig(), getWebMetaPhoneNumberId()]);
    return NextResponse.json({
      config, metaPhoneNumberId,
      firebaseProjectId: getAdminApp().options.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos',
      accessTokenConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar la configuración web.' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ error: 'Acceso restringido.' }, { status: 403 });
  try {
    const body = await request.json();
    const keys = ['storeName', 'logoUrl', 'heroImageUrl', 'supportPhone', 'botPhone', 'address', 'siteUrl', 'announcementText', 'shippingText', 'heroKicker', 'heroTitle', 'heroDescription'];
    if (!body?.config || !keys.every(key => typeof body.config[key] === 'string') || typeof body.metaPhoneNumberId !== 'string') {
      return NextResponse.json({ error: 'Faltan datos de la configuración.' }, { status: 400 });
    }
    const config = normalizeWebClientConfig(body.config);
    const metaPhoneNumberId = body.metaPhoneNumberId.trim();
    const error = validateWebClientConfig(config, metaPhoneNumberId);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const db = getAdminDb();
    const batch = db.batch();
    batch.set(db.collection('web_settings').doc('config'), config, { merge: true });
    batch.set(db.collection('web_settings').doc('integrations'), { metaPhoneNumberId }, { merge: true });
    await batch.commit();
    invalidateWebClientConfig();
    clearCatalogMemoryCache();
    try { revalidatePath('/productos'); revalidatePath('/productos/[id]', 'page'); } catch {}
    return NextResponse.json({ ok: true, config, metaPhoneNumberId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar la configuración web.' }, { status: 500 });
  }
}
