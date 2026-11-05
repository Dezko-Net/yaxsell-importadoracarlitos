/* Verifica producción en tiempo real.
   - proxy: lectura server-side cacheada; uso un limit NOVEL para forzar cache miss
     => prueba si el server puede leer (clave APPWRITE_API_KEY presente en Vercel).
   - direct: lectura anónima directa a Appwrite (lo que hace el scraper), SIN key.
   Uso: node prod-check.js <limitNumber>
*/
const SITE = 'https://kevincocochile.cl';
const ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const PROJECT = '6a0a4e8d0032177f3f90';
const DB = '6a0a58ca001798410d86';

const col = process.argv[2] || 'products';
const lim = process.argv[3] || '2';
const queryStr = JSON.stringify({ method: 'limit', values: [Number(lim)] });
const arr = JSON.stringify([queryStr]); // formato que espera el proxy

(async () => {
  // 1) PROXY (server-side, usa la key). limit novel = cache miss = lectura real.
  try {
    const u = `${SITE}/api/appwrite-proxy?colId=${col}&queries=${encodeURIComponent(arr)}`;
    const r = await fetch(u, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    console.log(`PROXY  status=${r.status} total=${j.total ?? '?'} docs=${(j.documents || []).length} err=${j.error || '-'}`);
  } catch (e) {
    console.log('PROXY  EXCEPTION', e.message);
  }

  // 2) DIRECTO ANÓNIMO (lo que hace el scraper): SIN X-Appwrite-Key.
  try {
    const u = `${ENDPOINT}/databases/${DB}/collections/${col}/documents?queries[0]=${encodeURIComponent(queryStr)}`;
    const r = await fetch(u, { headers: { 'X-Appwrite-Project': PROJECT }, cache: 'no-store' });
    const txt = await r.text();
    let total = '?';
    try { total = JSON.parse(txt).total; } catch {}
    console.log(`DIRECT status=${r.status} total=${total}  (scraper bloqueado si status=401)`);
  } catch (e) {
    console.log('DIRECT EXCEPTION', e.message);
  }
})();
