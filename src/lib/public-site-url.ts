const CANONICAL_SITE_ORIGIN = 'https://yaxsell.cl';
const ALLOWED_SITE_HOSTS = new Set(['yaxsell.cl', 'www.yaxsell.cl']);

/**
 * Dominio público usado en enlaces enviados a clientes.
 * VERCEL_URL es específico de cada deployment y nunca debe convertirse en un
 * enlace de compra o seguimiento. También ignoramos NEXT_PUBLIC_SITE_URL si
 * todavía apunta al dominio temporal de otro proyecto.
 */
export function getPublicSiteUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (!configured) return CANONICAL_SITE_ORIGIN;

  try {
    const candidate = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(configured) ? configured : `https://${configured}`);
    const hostname = candidate.hostname.toLowerCase();

    if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(hostname)) {
      return candidate.origin;
    }

    if (ALLOWED_SITE_HOSTS.has(hostname)) return CANONICAL_SITE_ORIGIN;
  } catch {
    // Una URL inválida no debe propagarse a los mensajes de clientes.
  }

  return CANONICAL_SITE_ORIGIN;
}
