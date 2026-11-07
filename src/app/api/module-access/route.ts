import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/db-server';
import { changeServiceModule, normalizeServiceModules, type ServiceModule } from '@/lib/module-access';
import { isSupremeOwner } from '@/lib/supreme-owner';

export const dynamic = 'force-dynamic';
const ref = () => getAdminDb().collection('system_settings').doc('module_access');

export async function GET() {
  try {
    const doc = await ref().get();
    return NextResponse.json({ modules: normalizeServiceModules(doc.data()?.modules) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'desconocido';
    console.warn('[module-access] No se pudo leer la configuración de Firebase:', code);
    return NextResponse.json({ error: 'No se pudo cargar la configuración de servicios.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
    let identity;
    try { identity = await getAuth(getAdminApp()).verifyIdToken(token); }
    catch { return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }); }
    if (!isSupremeOwner(identity.uid, identity.email)) {
      return NextResponse.json({ error: 'Acceso restringido.' }, { status: 403 });
    }
    const body = await request.json();
    const source = body?.source as ServiceModule;
    const target = body?.target as ServiceModule;
    if (!['web', 'erp', 'pos'].includes(source) || !['web', 'erp', 'pos'].includes(target) || typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Configuración inválida.' }, { status: 400 });
    }
    if (source === target && !body.enabled) return NextResponse.json({ error: 'No puedes desactivar el módulo desde el que estás trabajando.' }, { status: 400 });
    const modules = await getAdminDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref());
      const current = normalizeServiceModules(snapshot.data()?.modules);
      const updated = changeServiceModule(current, source, target, body.enabled);
      transaction.set(ref(), { modules: updated, updatedAt: Date.now(), updatedBy: identity.uid }, { merge: true });
      return updated;
    });
    return NextResponse.json({ modules }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'MODULE_DISABLED') return NextResponse.json({ error: 'El módulo actual está desactivado.' }, { status: 409 });
    return NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 });
  }
}
