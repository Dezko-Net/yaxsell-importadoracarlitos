// === Actualizar products.json y Firestore con nuevas URLs ===
// Reemplaza las URLs viejas de imágenes por las del nuevo storage de asistoraerp
// Uso: node update_urls.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const MANIFEST_PATH = path.join(__dirname, 'imagenes_descargadas', 'manifest_with_urls.json');
const PRODUCTS_JSON = path.join(__dirname, 'products.json');

const FIREBASE_API_KEY = 'AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A';
const PROJECT_ID = 'donbalatoivanchile';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();
const COL_PRODUCTS = 'donbalatoivan_products';
const DOC_OVERRIDES = 'donbalatoivan_config/overrides';

async function main() {
  console.log('🔄 Actualizando URLs de imágenes...\n');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // Mapa: sku -> new_url (solo las que tienen URL nueva)
  const urlMap = new Map();
  let hasNewUrl = 0, noNewUrl = 0;
  manifest.forEach(m => {
    if (m.new_url) {
      urlMap.set(m.sku, m.new_url);
      hasNewUrl++;
    } else {
      noNewUrl++;
    }
  });
  console.log(`📊 ${hasNewUrl} productos con URL nueva, ${noNewUrl} sin URL nueva (se mantienen originales)\n`);

  // 1. Actualizar products.json
  console.log('📦 Actualizando products.json...');
  const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
  let updatedJson = 0;
  products.forEach(p => {
    if (urlMap.has(p.sku)) {
      p.image = urlMap.get(p.sku);
      updatedJson++;
    }
  });
  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(products, null, 4));
  console.log(`✅ products.json: ${updatedJson} productos actualizados de ${products.length} totales\n`);

  // 2. Actualizar Firestore - overrides
  console.log('🔥 Actualizando Firestore overrides...');
  let overridesUpdated = 0;
  const newOverrides = {};

  // Leer overrides existentes
  try {
    const ovDoc = await db.doc(DOC_OVERRIDES).get();
    if (ovDoc.exists) {
      const existing = ovDoc.data().map || {};
      for (const sku in existing) {
        newOverrides[sku] = existing[sku];
      }
    }
  } catch (e) {
    console.warn('⚠️ No se pudieron leer overrides existentes:', e.message);
  }

  // Para productos que están en products.json, no necesitamos override (ya están en el JSON)
  // Pero para productos custom (solo en Firestore), necesitamos actualizar la colección
  console.log('🔥 Actualizando productos custom en Firestore...');
  let customUpdated = 0;
  const batch = db.batch();
  let batchCount = 0;

  const productsSnap = await db.collection(COL_PRODUCTS).get();
  productsSnap.forEach(doc => {
    const p = doc.data();
    if (urlMap.has(p.sku)) {
      batch.update(doc.ref, { image: urlMap.get(p.sku) });
      customUpdated++;
      batchCount++;
    }
  });

  // También añadir overrides para productos del JSON que ya tenían override de imagen
  for (const sku in newOverrides) {
    if (urlMap.has(sku)) {
      newOverrides[sku].image = urlMap.get(sku);
      overridesUpdated++;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`✅ Firestore productos custom: ${customUpdated} actualizados`);
  } else {
    console.log('ℹ️ No había productos custom que actualizar');
  }

  // Guardar overrides actualizados
  if (overridesUpdated > 0) {
    await db.doc(DOC_OVERRIDES).set({ map: newOverrides });
    console.log(`✅ Firestore overrides: ${overridesUpdated} actualizados`);
  } else {
    console.log('ℹ️ No había overrides que actualizar');
  }

  console.log(`\n✅ ¡ACTUALIZACIÓN COMPLETA!`);
  console.log(`📦 products.json: ${updatedJson} URLs actualizadas`);
  console.log(`🔥 Firestore productos: ${customUpdated} URLs actualizadas`);
  console.log(`🔥 Firestore overrides: ${overridesUpdated} URLs actualizadas`);
  console.log(`⚠️ ${noNewUrl} productos mantienen URL original (no se pudieron descargar)`);
  process.exit(0);
}

main().catch(err => { console.error('💥 Error fatal:', err); process.exit(1); });
