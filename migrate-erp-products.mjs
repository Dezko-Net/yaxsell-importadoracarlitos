// Migra los productos ERP desde geminai-449212 → asistoraerp
// Transforma los campos ERP al formato Yaxsel (NAME, PRICE, STOCK, etc.)
// pero MANTIENE los campos ERP originales (nombre, precio_detalle, etc.)
// para que /base-datos también funcione
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const sourceConfig = {
  apiKey: "AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A",
  authDomain: "geminai-449212.firebaseapp.com",
  projectId: "geminai-449212",
  storageBucket: "geminai-449212.firebasestorage.app",
  messagingSenderId: "786029583380",
  appId: "1:786029583380:web:c515391c5b673f4305db01",
};

const targetConfig = {
  apiKey: "AIzaSyCEcbWJSiDKXnAanhVb_hQ79fLbqeXpYYs",
  authDomain: "asistoraerp.firebaseapp.com",
  projectId: "asistoraerp",
  storageBucket: "asistoraerp.firebasestorage.app",
  messagingSenderId: "386824737987",
  appId: "1:386824737987:web:f85ebb6bae11190da3be76",
};

const sourceApp = initializeApp(sourceConfig, 'source');
const targetApp = initializeApp(targetConfig, 'target');
const sourceDb = getFirestore(sourceApp);
const targetDb = getFirestore(targetApp);

function transformErpToYaxsel(data) {
  const out = { ...data }; // Keep all original ERP fields
  
  // Map ERP → Yaxsel fields (only if Yaxsel field doesn't already exist)
  if (!out.NAME) out.NAME = data.nombre || '';
  if (!out.PRICE) out.PRICE = data.precio_detalle || data.precio_venta_1 || 0;
  if (!out.COST) out.COST = data.costo_uni || 0;
  if (!out.WHOLESALEPRICE) out.WHOLESALEPRICE = data.precio_mayorista || data.precio_venta_2 || 0;
  if (!out.EMPRENDEDORPRICE) out.EMPRENDEDORPRICE = data.precio_venta_3 || data.precio_mayorista || 0;
  if (!out.STOCK) out.STOCK = data.stock || 0;
  if (!out.ISACTIVE) out.ISACTIVE = data.isactive !== false;
  if (!out.CATEGORYID) out.CATEGORYID = data.category || '';
  if (!out.IMAGEURL) out.IMAGEURL = data.imageUrl || data.image || '';
  if (!out.IMAGEURL2) out.IMAGEURL2 = '';
  if (!out.IMAGEURL3) out.IMAGEURL3 = '';
  if (!out.DESCRIPTION) out.DESCRIPTION = '';
  if (!out.SKU) out.SKU = data.sku || '';
  if (!out.BARCODE) out.BARCODE = data.codigo_barra || '';
  if (!out.barcode) out.barcode = data.codigo_barra || '';
  if (!out.sku) out.sku = data.sku || '';
  if (!out.SOLDQUANTITY) out.SOLDQUANTITY = 0;
  if (!out.RATING) out.RATING = 0;
  if (!out.NUMREVIEWS) out.NUMREVIEWS = 0;
  if (!out.ISFEATURED) out.ISFEATURED = false;
  if (!out.PACKQTY) out.PACKQTY = 0;
  if (!out.WHOLESALEMINQUANTITY) out.WHOLESALEMINQUANTITY = 0;
  if (!out.TAGS) out.TAGS = [];
  if (!out.FEATURES) out.FEATURES = '';
  if (!out.DATE_ADDED) out.DATE_ADDED = new Date().toISOString();
  if (!out.storeId) out.storeId = 'main_store';
  
  // Mark as ERP product (for filtering in /base-datos)
  out.source = 'erp';
  
  return out;
}

async function main() {
  console.log('Leyendo productos ERP desde geminai-449212...');
  const snap = await getDocs(collection(sourceDb, 'products'));
  console.log(`Total productos ERP: ${snap.size}`);
  
  // Get existing Yaxsel product IDs to avoid overwriting
  console.log('Verificando productos Yaxsel existentes en asistoraerp...');
  const existingSnap = await getDocs(collection(targetDb, 'products'));
  const existingIds = new Set();
  const existingYaxselIds = new Set();
  existingSnap.docs.forEach(d => {
    existingIds.add(d.id);
    const data = d.data();
    if (data.NAME !== undefined && data.source !== 'erp') {
      existingYaxselIds.add(d.id);
    }
  });
  console.log(`Productos Yaxsel existentes: ${existingYaxselIds.size}`);
  
  console.log('\nTransformando y migrando productos ERP...');
  let migrated = 0;
  let skipped = 0;
  const batchSize = 400;
  const docs = snap.docs;
  
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(targetDb);
    const chunk = docs.slice(i, i + batchSize);
    
    for (const d of chunk) {
      // Skip if this ID already has a Yaxsel product
      if (existingYaxselIds.has(d.id)) {
        skipped++;
        continue;
      }
      
      const data = d.data();
      const transformed = transformErpToYaxsel(data);
      // Clean undefined values
      const cleanData = JSON.parse(JSON.stringify(transformed));
      
      // Use original doc ID
      batch.set(doc(targetDb, 'products', d.id), cleanData, { merge: true });
      migrated++;
    }
    
    await batch.commit();
    console.log(`  Procesados ${Math.min(i + batchSize, docs.length)}/${docs.length}...`);
  }
  
  console.log(`\n✓ Migración completa:`);
  console.log(`  Migrados: ${migrated}`);
  console.log(`  Saltados (ya existen como Yaxsel): ${skipped}`);
  
  // Verify total
  const finalSnap = await getDocs(collection(targetDb, 'products'));
  let yaxselCount = 0;
  let erpCount = 0;
  let withImage = 0;
  finalSnap.docs.forEach(d => {
    const data = d.data();
    if (data.source === 'erp') {
      erpCount++;
    } else {
      yaxselCount++;
    }
    if (data.IMAGEURL && data.IMAGEURL.trim()) withImage++;
  });
  
  console.log(`\n=== ESTADO FINAL ===`);
  console.log(`Total productos en asistoraerp: ${finalSnap.size}`);
  console.log(`  Productos Yaxsel (web): ${yaxselCount}`);
  console.log(`  Productos ERP: ${erpCount}`);
  console.log(`  Con imagen (visibles en web): ${withImage}`);
  console.log(`  Sin imagen: ${finalSnap.size - withImage}`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
