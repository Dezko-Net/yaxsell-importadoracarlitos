import 'server-only';

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { serverGetDocument } from '@/lib/db-server';
import { VENDORS_COLLECTION_ID } from '@/lib/db';

/**
 * Sesión de vendedor (marketplace) — firmada con HMAC, verificada 100% server-side.
 *
 * Por qué NO reusamos el patrón del admin (isAdminEmail + sesión Appwrite directa
 * desde el navegador): las colecciones `products`/`orders` tienen permisos
 * read/create/update/delete("any") en Appwrite, es decir CUALQUIERA con el
 * project ID (público, visible en el bundle del navegador) puede leer/escribir
 * TODO sin pasar por esta app. Eso es tolerable hoy porque solo tú operas el
 * admin, pero es INACEPTABLE para terceros (vendors) a quienes les damos
 * credenciales reales — cualquier vendor curioso podría ver pedidos y
 * productos de otros vendors o los tuyos abriendo la consola del navegador.
 *
 * Por eso: la colección `vendors`/`vendor_orders` NO tiene permisos públicos
 * (solo la API key server-side puede tocarlas), y el acceso de cada vendor se
 * valida en el servidor con esta cookie firmada antes de filtrar por
 * VENDOR_ID. El vendor nunca recibe una sesión de Appwrite usable desde el
 * navegador.
 */

const SECRET = process.env.VENDOR_SESSION_SECRET || process.env.APPWRITE_API_KEY || 'fallback-secret-change-me';
const COOKIE_NAME = 'vendor_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export interface VendorSessionPayload {
  vendorId: string;
  email: string;
  name: string;
  exp: number; // epoch ms
}

function sign(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

export function signVendorToken(payload: Omit<VendorSessionPayload, 'exp'>): string {
  const full: VendorSessionPayload = { ...payload, exp: Date.now() + TTL_MS };
  const json = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = sign(json);
  return `${json}.${sig}`;
}

export function verifyVendorToken(token: string | undefined | null): VendorSessionPayload | null {
  if (!token) return null;
  const [json, sig] = token.split('.');
  if (!json || !sig) return null;
  try {
    const expectedSig = sign(json);
    // Comparación en tiempo constante para evitar timing attacks.
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as VendorSessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.vendorId || !payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}

export const VENDOR_COOKIE_NAME = COOKIE_NAME;

/** Lee y valida la sesión de vendor desde el request. Devuelve null si no hay sesión válida. */
export function getVendorSession(req: NextRequest): VendorSessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return verifyVendorToken(token);
}

/** Also checks the vendor is still enabled, so disabling an account takes effect immediately. */
export async function getActiveVendorSession(req: NextRequest): Promise<VendorSessionPayload | null> {
  const session = getVendorSession(req);
  if (!session) return null;

  try {
    const vendor = await serverGetDocument(VENDORS_COLLECTION_ID, session.vendorId) as any;
    return vendor?.ACTIVE === true ? session : null;
  } catch {
    return null;
  }
}

// ─── Password hashing (scrypt, sin dependencias externas) ───────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  try {
    const attempt = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return attempt.length === expected.length && crypto.timingSafeEqual(attempt, expected);
  } catch {
    return false;
  }
}

/** Genera una contraseña legible para entregar al vendor (ej: "TIENDA-4821-KX") */
export function generateVendorPassword(): string {
  const part = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${part()}-${part()}`;
}
