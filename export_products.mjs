import fs from 'fs';

const KEY = 'standard_c476eaadc21bbecc3b6949ee4d0a932613b7a3d4ee52c80cf2c1406750ff75267becfad617da0acd444d0b903b8faea19661d48b2f8b6dc09b678e0db164ddd4b472417c3477a091188554bdd2adfad944778a2927090744ae991c9dcf48c7cebc60e437f5c8a841ffb0736da27daf197bf5716065c2ea5dda65070b07d74642';
const BASE = 'https://nyc.cloud.appwrite.io/v1/databases/6a0a58ca001798410d86/collections/products/documents';
const H = { 'X-Appwrite-Project': '6a0a4e8d0032177f3f90', 'X-Appwrite-Key': KEY, 'Content-Type': 'application/json' };

async function run() {
  let all = [];
  let off = 0;
  let total = 0;
  do {
    const q0 = encodeURIComponent('limit(100)');
    const q1 = encodeURIComponent('offset(' + off + ')');
    const url = BASE + `?queries[0]=${q0}&queries[1]=${q1}`;
    console.log('URL:', url);
    const r = await fetch(url, { headers: H });
    const d = await r.json();
    if (!r.ok) { console.error('Error:', JSON.stringify(d)); break; }
    total = d.total;
    all = all.concat(d.documents);
    console.log(`Lote offset=${off} trajo=${d.documents.length} acum=${all.length}/${total}`);
    off += 100;
  } while (off < total && all.length > 0);

  fs.writeFileSync('productos_export.json', JSON.stringify(all, null, 2));
  console.log(`\nTotal: ${total} | Exportados: ${all.length}`);
  const sz = fs.statSync('productos_export.json').size;
  console.log(`Archivo: ${(sz / 1048576).toFixed(2)} MB`);
}
run();
