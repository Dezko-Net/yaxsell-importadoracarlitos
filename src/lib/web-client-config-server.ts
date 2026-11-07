import 'server-only';
import { getAdminDb } from '@/lib/db-server';
import { DEFAULT_WEB_CLIENT_CONFIG, normalizeWebClientConfig, validateWebClientConfig, type WebClientConfig } from '@/lib/web-client-config';

const g = globalThis as unknown as {
  __webClientConfig?: { value: WebClientConfig; expires: number };
  __webMetaId?: { value: string; expires: number };
};
const CACHE_MS = 1000;

export function invalidateWebClientConfig() {
  g.__webClientConfig = undefined;
  g.__webMetaId = undefined;
}

export async function getWebClientConfig(): Promise<WebClientConfig> {
  if (g.__webClientConfig && g.__webClientConfig.expires > Date.now()) return g.__webClientConfig.value;
  const db = getAdminDb();
  const [web, legacy] = await Promise.all([
    db.collection('web_settings').doc('config').get(),
    db.collection('store_settings').doc('main').get(),
  ]);
  const previous = legacy.data() || {};
  const data = web.data() || {};
  const candidate = normalizeWebClientConfig({ ...DEFAULT_WEB_CLIENT_CONFIG, siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '' });
  const envSiteUrl = validateWebClientConfig(candidate, '') ? '' : candidate.siteUrl;
  const value = normalizeWebClientConfig({
    ...DEFAULT_WEB_CLIENT_CONFIG,
    ...(previous.storeName ? { storeName: previous.storeName } : {}),
    ...(previous.logoUrl ? { logoUrl: previous.logoUrl } : {}),
    ...(envSiteUrl ? { siteUrl: envSiteUrl } : {}),
    ...data,
  });
  g.__webClientConfig = { value, expires: Date.now() + CACHE_MS };
  return value;
}

export async function getWebMetaPhoneNumberId(): Promise<string> {
  if (g.__webMetaId && g.__webMetaId.expires > Date.now()) return g.__webMetaId.value;
  const snapshot = await getAdminDb().collection('web_settings').doc('integrations').get();
  const configured = snapshot.data()?.metaPhoneNumberId;
  const value = typeof configured === 'string' ? configured.trim() : (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  g.__webMetaId = { value, expires: Date.now() + CACHE_MS };
  return value;
}
