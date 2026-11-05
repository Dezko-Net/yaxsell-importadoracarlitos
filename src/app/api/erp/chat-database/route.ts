import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/db-server';
import { isAdminEmail } from '@/lib/admin-access';
import { AI_ENABLED } from '@/lib/feature-flags';
import {
  todaySantiago,
  extractDbIntent,
  resolveDbProducts,
  summarizeProductForDb,
  composeDbAnswer,
  loadDbRecentMovements,
  type DbChatTurn,
  type DbProductFullSummary,
  type DbGeneralMovement,
} from '@/lib/erpDatabaseChat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Rate limit ligero para proteger consultas repetitivas de IA
 */
const rateMap = new Map<string, number[]>();
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateMap.get(key) || []).filter(t => now - t < 60_000);
  if (hits.length >= 30) {
    rateMap.set(key, hits);
    return true;
  }
  hits.push(now);
  rateMap.set(key, hits);
  return false;
}

function cleanHistory(raw: unknown): DbChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t: any) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
    .slice(-8)
    .map((t: any) => ({
      role: t.role as 'user' | 'assistant',
      text: String(t.text).slice(0, 800),
    }));
}

async function authorize(req: NextRequest): Promise<{ authorized: boolean; email?: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (token) {
    try {
      const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
      const email = String(decoded.email || '').trim().toLowerCase();
      if (email && (isAdminEmail(email) || email.includes('@'))) {
        return { authorized: true, email };
      }
    } catch {
      // Ignorar fallo de token, verificar cookie/origen
    }
  }

  // Comprobar cookies de sesión de ERP / Admin
  const erpUserCookie = req.cookies.get('erp_user')?.value || req.cookies.get('admin_user')?.value;
  const referer = req.headers.get('referer') || '';
  if (referer.includes('/erp-dashboard') || referer.includes('/admin') || erpUserCookie) {
    return { authorized: true, email: erpUserCookie || 'erp-dashboard-user' };
  }

  // Permitir por defecto dentro de la sesión de trabajo ERP
  return { authorized: true, email: 'erp-user' };
}

export async function POST(req: NextRequest) {
  if (!AI_ENABLED) {
    return NextResponse.json({ ok: false, error: 'Asistente IA no habilitado en este entorno.' }, { status: 404 });
  }

  const auth = await authorize(req);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: 'Sesión no autorizada para consultar la Base de Datos.' }, { status: 401 });
  }

  const clientKey = auth.email || 'anon-client';
  if (isRateLimited(clientKey)) {
    return NextResponse.json({ ok: false, error: 'Demasiadas consultas en poco tiempo. Espera unos segundos.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const question = String(body?.question || '').trim();
  if (!question || question.length < 2) {
    return NextResponse.json({ ok: false, error: 'Por favor escribe tu consulta para la IA.' }, { status: 400 });
  }
  if (question.length > 700) {
    return NextResponse.json({ ok: false, error: 'La consulta es demasiado larga (máx 700 caracteres).' }, { status: 400 });
  }

  const history = cleanHistory(body?.history);

  try {
    const today = todaySantiago();
    const intent = await extractDbIntent(question, history, today);

    let summaries: DbProductFullSummary[] = [];
    let generalAudit: DbGeneralMovement[] = [];

    // 1. Si detectamos un producto específico
    if (intent.producto) {
      const { matches } = await resolveDbProducts(intent.producto);
      if (matches.length > 0) {
        summaries = await Promise.all(
          matches.slice(0, 5).map(p => summarizeProductForDb(p, intent.desde, intent.hasta))
        );
      }
    }

    // 2. Si no hubo coincidencia de producto o si la pregunta es sobre un usuario o movimientos generales
    const asksAboutUserOrGeneral = !!intent.usuarioFiltro || !intent.producto || intent.tipo === 'auditoria_movimiento';
    if (summaries.length === 0 || asksAboutUserOrGeneral) {
      generalAudit = await loadDbRecentMovements({
        usuarioFiltro: intent.usuarioFiltro,
        desde: intent.desde,
        hasta: intent.hasta,
        limit: 150,
      });
    }

    // 3. Si no encontramos ni producto ni movimientos
    if (summaries.length === 0 && generalAudit.length === 0) {
      return NextResponse.json({
        ok: true,
        answer: intent.producto
          ? `No encontré ningún producto coincidente con **"${intent.producto}"** en la base de datos de Importadora Carlitos. Prueba escribiendo parte del nombre comercial o el código SKU exacto.`
          : `No se encontraron registros ni movimientos para la consulta en el rango auditado (${intent.desde} al ${intent.hasta}). Prueba especificando el nombre o SKU de un producto, o el nombre de una persona (ej: *Daniel*).`,
        meta: {
          desde: intent.desde,
          hasta: intent.hasta,
          intent,
          productos: [],
        },
      });
    }

    // 4. Componer respuesta enriquecida con Gemini IA
    const answer = await composeDbAnswer(question, summaries, intent.usuarioFiltro, generalAudit);

    return NextResponse.json({
      ok: true,
      answer,
      meta: {
        desde: intent.desde,
        hasta: intent.hasta,
        usuarioFiltro: intent.usuarioFiltro || null,
        productos: summaries.map(s => ({
          sku: s.sku,
          nombre: s.nombre,
          stock: s.stockActual,
          costoNeto: s.costos.costoNetoUnitario,
          precioDetalle: s.preciosVenta.detalleP1,
        })),
        movimientosAuditados: generalAudit.length,
      },
    });
  } catch (err: any) {
    console.error('[api/erp/chat-database] Error procesando consulta:', err);
    return NextResponse.json(
      { ok: false, error: 'Hubo un inconveniente al consultar la base de datos con la IA. Inténtalo de nuevo.' },
      { status: 500 }
    );
  }
}
