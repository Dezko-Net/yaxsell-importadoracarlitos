const PROJECT_ID = '6a0a4e8d0032177f3f90';
const API_KEY = 'standard_c476eaadc21bbecc3b6949ee4d0a932613b7a3d4ee52c80cf2c1406750ff75267becfad617da0acd444d0b903b8faea19661d48b2f8b6dc09b678e0db164ddd4b472417c3477a091188554bdd2adfad944778a2927090744ae991c9dcf48c7cebc60e437f5c8a841ffb0736da27daf197bf5716065c2ea5dda65070b07d74642';
const DB_ID = '6a0a58ca001798410d86';
const COL_ID = 'products';
const BASE = `https://nyc.cloud.appwrite.io/v1/databases/${DB_ID}/collections/${COL_ID}/documents`;
const HEADERS = { 'X-Appwrite-Project': PROJECT_ID, 'X-Appwrite-Key': API_KEY };

async function main() {
  let all = [];
  let cursor = null;
  let total = 0;
  do {
    let url = BASE + '?limit=2000';
    if (cursor) url += '&cursorAfter=' + cursor;
    const r = await fetch(url, { headers: HEADERS });
    const j = await r.json();
    all.push(...j.documents);
    total = j.total;
    if (j.documents.length > 0) {
      cursor = j.documents[j.documents.length - 1].$id;
    } else {
      break;
    }
  } while (all.length < total);

  // Check for empty/whitespace/null IMAGEURL
  const noImg = all.filter(p => {
    const url = String(p.IMAGEURL || '').trim();
    return !url || url === '' || url === 'null' || url === 'undefined';
  });

  console.log(`Total productos: ${all.length}`);
  console.log(`Sin imagen REAL: ${noImg.length}`);
  console.log(`Con imagen: ${all.length - noImg.length}`);
  console.log('');

  // Check specific SKUs
  const skus = ['SD644','SD643','QM61875','QM61874','QM61873','MK0146','MK0145','KC90241','KC259404','KC248711','FY7'];
  console.log('SKUs especificos:');
  skus.forEach(s => {
    const p = all.find(x => x.sku === s);
    if (p) {
      console.log(`  ${s} | IMAGEURL=[${p.IMAGEURL}] | NAME=${p.NAME}`);
    } else {
      console.log(`  ${s} | NO ENCONTRADO EN BD`);
    }
  });
  console.log('');

  // Show all without image
  console.log('Todos los sin imagen:');
  noImg.forEach(p => console.log(`${p.sku} | ${p.NAME}`));
}

main().catch(e => console.error(e));
