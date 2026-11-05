// === Actualizar Firestore via REST API (sin admin SDK) ===
// Actualiza overrides y productos custom con las nuevas URLs
// Uso: node update_firestore_rest.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const FIREBASE_API_KEY = 'AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A';
const PROJECT_ID = 'donbalatoivanchile';
const MANIFEST_PATH = path.join(__dirname, 'imagenes_descargadas', 'manifest_with_urls.json');

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function extractField(field) {
  if (!field) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return parseInt(field.integerValue);
  if (field.doubleValue !== undefined) return parseFloat(field.doubleValue);
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.arrayValue && field.arrayValue.values) return field.arrayValue.values.map(v => extractField(v));
  if (field.mapValue && field.mapValue.fields) {
    const obj = {};
    for (const k in field.mapValue.fields) obj[k] = extractField(field.mapValue.fields[k]);
    return obj;
  }
  if (field.nullValue !== undefined) return null;
  return null;
}

function toFirestoreValue(val) {
  if (val === null) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const k in val) fields[k] = toFirestoreValue(val[k]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

async function main() {
  console.log('🔄 Actualizando Firestore via REST API...\n');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const urlMap = new Map();
  manifest.forEach(m => { if (m.new_url) urlMap.set(m.sku, m.new_url); });
  console.log(`📊 ${urlMap.size} URLs nuevas para actualizar\n`);

  // 1. Leer overrides actuales
  console.log('📖 Leyendo overrides...');
  let existingOverrides = {};
  try {
    const ovRes = await httpsRequest(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/donbalatoivan_config/overrides?key=${FIREBASE_API_KEY}`
    );
    if (ovRes.fields && ovRes.fields.map && ovRes.fields.map.mapValue) {
      const rawMap = ovRes.fields.map.mapValue.fields;
      for (const k in rawMap) {
        existingOverrides[k] = extractField(rawMap[k]);
      }
      console.log(`✅ ${Object.keys(existingOverrides).length} overrides encontrados`);
    } else {
      console.log('ℹ️ No hay overrides');
    }
  } catch (e) {
    console.warn('⚠️ Error leyendo overrides:', e.message);
  }

  // 2. Actualizar overrides que tengan image
  let overridesChanged = 0;
  for (const sku in existingOverrides) {
    if (urlMap.has(sku)) {
      existingOverrides[sku].image = urlMap.get(sku);
      overridesChanged++;
    }
  }

  if (overridesChanged > 0) {
    console.log(`\n📝 Guardando ${overridesChanged} overrides actualizados...`);
    const fields = {};
    for (const k in existingOverrides) {
      fields[k] = toFirestoreValue(existingOverrides[k]);
    }
    const body = { fields: { map: { mapValue: { fields } } } };
    try {
      await httpsRequest(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/donbalatoivan_config?key=${FIREBASE_API_KEY}`,
        { method: 'PATCH', headers: {} },
        body
      );
      // El doc se llama overrides, necesitamos hacer set al doc completo
      await httpsRequest(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/donbalatoivan_config/overrides?key=${FIREBASE_API_KEY}`,
        { method: 'PATCH' },
        body
      );
      console.log('✅ Overrides guardados');
    } catch (e) {
      console.warn('⚠️ Error guardando overrides:', e.message);
    }
  } else {
    console.log('ℹ️ No hay overrides que actualizar');
  }

  // 3. Leer productos custom de Firestore
  console.log('\n📖 Leyendo productos custom...');
  let customProducts = [];
  let customDocs = [];
  try {
    const pRes = await httpsRequest(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/donbalatoivan_products?pageSize=1000&key=${FIREBASE_API_KEY}`
    );
    if (pRes.documents) {
      customDocs = pRes.documents;
      customProducts = pRes.documents.map(d => {
        const obj = { _name: d.name };
        if (d.fields) for (const k in d.fields) obj[k] = extractField(d.fields[k]);
        return obj;
      });
      console.log(`✅ ${customProducts.length} productos custom encontrados`);
    } else {
      console.log('ℹ️ No hay productos custom');
    }
  } catch (e) {
    console.warn('⚠️ Error leyendo productos custom:', e.message);
  }

  // 4. Actualizar productos custom que tengan imagen
  let customUpdated = 0;
  for (let i = 0; i < customProducts.length; i++) {
    const p = customProducts[i];
    if (urlMap.has(p.sku)) {
      const newName = customDocs[i].name;
      const newUrl = urlMap.get(p.sku);
      try {
        await httpsRequest(
          `https://firestore.googleapis.com/v1/${newName}?updateMask.fieldPaths=image&key=${FIREBASE_API_KEY}`,
          { method: 'PATCH' },
          { fields: { image: { stringValue: newUrl } } }
        );
        customUpdated++;
        console.log(`✅ [${customUpdated}] ${p.sku}: ${newUrl.substring(0, 80)}...`);
      } catch (e) {
        console.error(`❌ ${p.sku}: ${e.message}`);
      }
    }
  }
  console.log(`\n🔥 Productos custom: ${customUpdated} actualizados`);

  console.log(`\n✅ ¡ACTUALIZACIÓN DE FIRESTORE COMPLETA!`);
  console.log(`🔥 Overrides: ${overridesChanged} actualizados`);
  console.log(`🔥 Productos custom: ${customUpdated} actualizados`);
  process.exit(0);
}

main().catch(err => { console.error('💥 Error fatal:', err); process.exit(1); });
