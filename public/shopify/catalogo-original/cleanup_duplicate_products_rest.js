// Vista previa/limpieza de copias base vía Firestore REST.
// Vista previa: node cleanup_duplicate_products_rest.js
// Aplicar borrado: node cleanup_duplicate_products_rest.js --apply

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A';
const PROJECT = 'donbalatoivanchile';
const collection = 'donbalatoivan_products';
const baseProducts = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
const baseSkus = new Set(baseProducts.map(p => String(p.sku).trim()));

function request(method, url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}?pageSize=1000&key=${API_KEY}`;
  const result = await request('GET', url);
  const docs = result.documents || [];
  const keepSku = '153';
  const preserved = docs.filter(doc => {
    const sku = doc.fields?.sku?.stringValue || doc.name.split('/').pop();
    return String(sku).trim() === keepSku;
  });
  const duplicates = docs.filter(doc => !preserved.includes(doc));

  console.log(`Base JSON: ${baseProducts.length}`);
  console.log(`Firestore custom actuales: ${docs.length}`);
  console.log(`Registros sobrantes a borrar: ${duplicates.length}`);
  console.log(`Custom reales a conservar: ${preserved.length}`);
  console.log(`Total final esperado: ${baseProducts.length + preserved.length}`);
  console.log('Custom conservados:', preserved.map(d => ({
    sku: d.fields?.sku?.stringValue || d.name.split('/').pop(),
    name: d.fields?.name?.stringValue || '(sin nombre)'
  })));

  if (!apply) {
    console.log('Vista previa. No se borró nada. Para aplicar: node cleanup_duplicate_products_rest.js --apply');
    return;
  }

  for (const doc of duplicates) {
    await request('DELETE', `https://firestore.googleapis.com/v1/${doc.name}?key=${API_KEY}`);
  }
  console.log(`Limpieza completada: ${duplicates.length} copias eliminadas.`);
}

main().catch(error => { console.error('Error:', error.message); process.exitCode = 1; });
