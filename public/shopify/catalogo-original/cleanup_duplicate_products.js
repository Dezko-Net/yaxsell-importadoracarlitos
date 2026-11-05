// Limpia copias de productos base en Firestore.
// Conserva únicamente productos custom cuyo SKU no existe en products.json.
// Uso: node cleanup_duplicate_products.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const productsPath = path.join(__dirname, 'products.json');
const baseProducts = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
const baseSkus = new Set(baseProducts.map(p => String(p.sku).trim()));

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'donbalatoivanchile',
});

const db = admin.firestore();
const collection = db.collection('donbalatoivan_products');

async function main() {
  const apply = process.argv.includes('--apply');
  const snapshot = await collection.get();
  const duplicates = snapshot.docs.filter(doc => {
    const data = doc.data();
    return baseSkus.has(String(data.sku || doc.id).trim());
  });
  const preserved = snapshot.docs.filter(doc => !duplicates.includes(doc));

  console.log(`Base JSON: ${baseProducts.length}`);
  console.log(`Firestore custom actuales: ${snapshot.size}`);
  console.log(`Copias base a borrar: ${duplicates.length}`);
  console.log(`Custom reales a conservar: ${preserved.length}`);
  console.log(`Total final esperado: ${baseProducts.length + preserved.length}`);
  console.log('SKUs conservados:', preserved.map(doc => doc.data().sku || doc.id).join(', ') || '(ninguno)');

  if (duplicates.length === 0) {
    console.log('No hay copias base para borrar.');
    return;
  }
  if (!apply) {
    console.log('Vista previa únicamente. Para borrar usa: node cleanup_duplicate_products.js --apply');
    return;
  }

  const batchSize = 400;
  for (let i = 0; i < duplicates.length; i += batchSize) {
    const batch = db.batch();
    duplicates.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Borrados ${Math.min(i + batchSize, duplicates.length)}/${duplicates.length}`);
  }

  console.log('Limpieza completada.');
}

main().catch(error => {
  console.error('Error limpiando duplicados:', error.message);
  process.exitCode = 1;
});
