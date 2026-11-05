// === Descarga masiva de imágenes de productos ===
// Sin firebase-admin, usa fetch + REST API de Firestore
// Uso: node download_images.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const FIREBASE_API_KEY = 'AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A';
const PROJECT_ID = 'donbalatoivanchile';

const OUT_DIR = path.join(__dirname, 'imagenes_descargadas');
const IMAGES_SUBDIR = path.join(OUT_DIR, 'productos');
const LOGOS_SUBDIR = path.join(OUT_DIR, 'logos');
const CATS_SUBDIR = path.join(OUT_DIR, 'categorias');

[OUT_DIR, IMAGES_SUBDIR, LOGOS_SUBDIR, CATS_SUBDIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function sanitizeFilename(str) {
  return (str || 'sin_nombre').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_').substring(0, 80);
}

function getExtFromUrl(url) {
  const m = url.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff?)(\?|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg').replace('tiff', 'tif');
  if (url.includes('firebasestorage')) return 'webp';
  return 'jpg';
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch(e) {}
      reject(err);
    });
  });
}

async function readFirestoreDoc(docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}?key=${FIREBASE_API_KEY}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`)); return; }
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function readFirestoreCollection(colPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${colPath}?pageSize=1000&key=${FIREBASE_API_KEY}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`)); return; }
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
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

function extractDoc(doc) {
  if (!doc.fields) return {};
  const obj = {};
  for (const k in doc.fields) obj[k] = extractField(doc.fields[k]);
  return obj;
}

async function main() {
  console.log('🚀 Iniciando descarga masiva de imágenes...\n');

  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
    console.log(`📦 products.json: ${products.length} productos`);
  } catch (e) {
    console.warn('⚠️ No se pudo leer products.json:', e.message);
  }

  let customProducts = [];
  let overrides = {};
  let settings = {};
  let customCategories = {};

  try {
    console.log('🔥 Leyendo Firestore via REST API...');
    const [productsRes, ovRes, catRes, settingsRes] = await Promise.all([
      readFirestoreCollection('donbalatoivan_products'),
      readFirestoreDoc('donbalatoivan_config/overrides'),
      readFirestoreDoc('donbalatoivan_config/categories'),
      readFirestoreDoc('donbalatoivan_config/settings'),
    ]);

    if (productsRes.documents) {
      customProducts = productsRes.documents.map(extractDoc);
      console.log(`🔥 Productos custom en Firestore: ${customProducts.length}`);
    }
    if (ovRes.fields && ovRes.fields.map && ovRes.fields.map.mapValue) {
      const rawMap = ovRes.fields.map.mapValue.fields;
      for (const k in rawMap) overrides[k] = extractField(rawMap[k]);
      console.log(`🔥 Overrides: ${Object.keys(overrides).length}`);
    }
    if (settingsRes.fields) {
      settings = extractDoc(settingsRes);
      console.log(`🔥 Settings: ${JSON.stringify(settings)}`);
    }
    if (catRes.fields && catRes.fields.map && catRes.fields.map.mapValue) {
      const rawMap = catRes.fields.map.mapValue.fields;
      for (const k in rawMap) {
        const val = extractField(rawMap[k]);
        if (val !== '__DELETED__' && val && typeof val === 'object') {
          customCategories[k.replace(/\|\|/g, '/')] = val;
        }
      }
      console.log(`🔥 Categorías custom: ${Object.keys(customCategories).length}`);
    }
  } catch (e) {
    console.warn('⚠️ Error leyendo Firestore:', e.message);
  }

  const productMap = new Map();
  products.forEach(p => productMap.set(p.sku, { ...p }));
  for (const sku in overrides) {
    if (productMap.has(sku)) productMap.set(sku, { ...productMap.get(sku), ...overrides[sku] });
    else productMap.set(sku, { sku, ...overrides[sku] });
  }
  customProducts.forEach(p => {
    if (productMap.has(p.sku)) productMap.set(p.sku, { ...productMap.get(p.sku), ...p });
    else productMap.set(p.sku, p);
  });

  const allProducts = [...productMap.values()].filter(p => p.image && p.image.trim());
  console.log(`\n🖼️ Total productos con imagen: ${allProducts.length}\n`);

  let downloaded = 0, failed = 0;
  const failedList = [];
  const BATCH = 10;

  for (let i = 0; i < allProducts.length; i += BATCH) {
    const batch = allProducts.slice(i, i + BATCH);
    await Promise.all(batch.map(async (p) => {
      const imgUrl = p.image.trim();
      if (!imgUrl) return;
      const ext = getExtFromUrl(imgUrl);
      const filename = `${sanitizeFilename(p.sku)}_${sanitizeFilename(p.name)}.${ext}`;
      const destPath = path.join(IMAGES_SUBDIR, filename);
      if (fs.existsSync(destPath)) { downloaded++; return; }
      try {
        await downloadFile(imgUrl, destPath);
        console.log(`✅ [${downloaded + failed + 1}/${allProducts.length}] ${filename}`);
        downloaded++;
      } catch (err) {
        console.error(`❌ ${filename}: ${err.message}`);
        failed++;
        failedList.push({ sku: p.sku, name: p.name, url: imgUrl, error: err.message });
      }
    }));
  }

  console.log(`\n📊 Productos: ${downloaded} descargadas, ${failed} fallidas`);

  if (settings.logoUrl) {
    try {
      const ext = getExtFromUrl(settings.logoUrl);
      const logoPath = path.join(LOGOS_SUBDIR, `logo.${ext}`);
      console.log(`\n🏷️  Descargando logo...`);
      await downloadFile(settings.logoUrl, logoPath);
      console.log(`✅ Logo guardado`);
    } catch (err) { console.error(`❌ Logo: ${err.message}`); }
  }

  let catDownloaded = 0;
  for (const [catPath, catData] of Object.entries(customCategories)) {
    if (catData && catData.image) {
      try {
        const ext = getExtFromUrl(catData.image);
        const filename = `${sanitizeFilename(catPath)}.${ext}`;
        const destPath = path.join(CATS_SUBDIR, filename);
        if (!fs.existsSync(destPath)) {
          console.log(`📂 ${filename}`);
          await downloadFile(catData.image, destPath);
          catDownloaded++;
        }
      } catch (err) { console.error(`❌ Cat ${catPath}: ${err.message}`); }
    }
  }
  console.log(`📂 Categorías: ${catDownloaded} descargadas`);

  const manifest = allProducts.map(p => {
    const ext = getExtFromUrl(p.image);
    const filename = `${sanitizeFilename(p.sku)}_${sanitizeFilename(p.name)}.${ext}`;
    return { sku: p.sku, name: p.name, category: p.category, subcategory: p.subcategory, image_url: p.image, local_file: filename };
  });
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  if (failedList.length > 0) {
    fs.writeFileSync(path.join(OUT_DIR, 'imagenes_fallidas.json'), JSON.stringify(failedList, null, 2));
    console.log(`\n⚠️ ${failedList.length} fallidas guardadas en imagenes_fallidas.json`);
  }

  console.log(`\n✅ ¡DESCARGA COMPLETA!`);
  console.log(`📁 ${IMAGES_SUBDIR}`);
  console.log(`📁 ${LOGOS_SUBDIR}`);
  console.log(`📁 ${CATS_SUBDIR}`);
  console.log(`📄 ${path.join(OUT_DIR, 'manifest.json')}`);
  process.exit(0);
}

main().catch(err => { console.error('💥 Error fatal:', err); process.exit(1); });
