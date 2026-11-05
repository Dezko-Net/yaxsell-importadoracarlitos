// === Subida masiva de imágenes a Firebase Storage (asistoraerp) ===
// Sube todas las imágenes de imagenes_descargadas/ a gs://asistoraerp.firebasestorage.app/DONBALATO/
// Uso: node upload_images.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const IMAGES_DIR = path.join(__dirname, 'imagenes_descargadas', 'productos');
const LOGOS_DIR = path.join(__dirname, 'imagenes_descargadas', 'logos');
const CATS_DIR = path.join(__dirname, 'imagenes_descargadas', 'categorias');
const MANIFEST_PATH = path.join(__dirname, 'imagenes_descargadas', 'manifest.json');

const PROJECT_ID = 'asistoraerp';
const BUCKET_PATH = 'DONBALATO';

// Inicializar con ADC
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: `${PROJECT_ID}.firebasestorage.app`,
});

const bucket = admin.storage().bucket();

async function uploadFile(localPath, remotePath) {
  const exists = fs.existsSync(localPath);
  if (!exists) return false;
  await bucket.upload(localPath, {
    destination: remotePath,
    metadata: { cacheControl: 'public, max-age=31536000' },
  });
  return true;
}

async function main() {
  console.log('🚀 Subiendo imágenes a gs://asistoraerp.firebasestorage.app/DONBALATO/ ...\n');

  // 1. Subir imágenes de productos
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  let uploaded = 0, failed = 0;
  const BATCH = 10;

  for (let i = 0; i < manifest.length; i += BATCH) {
    const batch = manifest.slice(i, i + BATCH);
    await Promise.all(batch.map(async (m) => {
      const localPath = path.join(IMAGES_DIR, m.local_file);
      const remotePath = `${BUCKET_PATH}/productos/${m.local_file}`;
      try {
        if (!fs.existsSync(localPath)) { failed++; return; }
        await uploadFile(localPath, remotePath);
        uploaded++;
        console.log(`✅ [${uploaded + failed}/${manifest.length}] ${m.local_file}`);
      } catch (err) {
        failed++;
        console.error(`❌ ${m.local_file}: ${err.message}`);
      }
    }));
  }

  console.log(`\n📊 Productos: ${uploaded} subidas, ${failed} fallidas`);

  // 2. Subir logos
  let logoCount = 0;
  if (fs.existsSync(LOGOS_DIR)) {
    const logos = fs.readdirSync(LOGOS_DIR);
    for (const logo of logos) {
      try {
        await uploadFile(path.join(LOGOS_DIR, logo), `${BUCKET_PATH}/logos/${logo}`);
        console.log(`🏷️  ✅ ${logo}`);
        logoCount++;
      } catch (err) { console.error(`❌ Logo ${logo}: ${err.message}`); }
    }
  }
  console.log(`🏷️  Logos: ${logoCount} subidos`);

  // 3. Subir categorías
  let catCount = 0;
  if (fs.existsSync(CATS_DIR)) {
    const cats = fs.readdirSync(CATS_DIR);
    for (const cat of cats) {
      try {
        await uploadFile(path.join(CATS_DIR, cat), `${BUCKET_PATH}/categorias/${cat}`);
        console.log(`📂 ✅ ${cat}`);
        catCount++;
      } catch (err) { console.error(`❌ Cat ${cat}: ${err.message}`); }
    }
  }
  console.log(`📂 Categorías: ${catCount} subidas`);

  // 4. Generar URLs públicas y actualizar manifest
  console.log('\n🔗 Generando URLs públicas...');
  const updatedManifest = [];
  for (const m of manifest) {
    const remotePath = `${BUCKET_PATH}/productos/${m.local_file}`;
    try {
      const file = bucket.file(remotePath);
      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${PROJECT_ID}.firebasestorage.app/${remotePath}`;
      updatedManifest.push({ ...m, new_url: publicUrl });
    } catch (err) {
      updatedManifest.push({ ...m, new_url: null, error: err.message });
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'imagenes_descargadas', 'manifest_with_urls.json'),
    JSON.stringify(updatedManifest, null, 2)
  );
  console.log(`📄 Manifest con URLs: imagenes_descargadas/manifest_with_urls.json`);

  console.log(`\n✅ ¡SUBIDA COMPLETA!`);
  console.log(`📦 Bucket: gs://${PROJECT_ID}.firebasestorage.app/${BUCKET_PATH}/`);
  process.exit(0);
}

main().catch(err => { console.error('💥 Error fatal:', err); process.exit(1); });
