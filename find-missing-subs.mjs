/**
 * Encuentra las subcategorias faltantes en Firestore y las crea usando el nombre
 * que los productos tienen en su campo SUBCATEGORYNAMES o similar
 */
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envPath = path.join(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf-8');
for (const line of content.split('\n')) {
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) continue;
  const key = line.substring(0, eqIdx).trim();
  const val = line.substring(eqIdx + 1).replace(/^["']|["']$/g, '').trim();
  process.env[key] = val;
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'yaxselldemo';
const databaseId = process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'donbalato';

let cred = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const app = initializeApp({ credential: cert(cred) }, 'fix-subs');
const db = getFirestore(app, databaseId);

async function main() {
  // 1. Obtener subcategorias existentes
  const snap = await db.collection('subcategories').get();
  const existingIds = new Set(snap.docs.map(d => d.id));
  const existingSubs = {};
  snap.docs.forEach(d => {
    const data = d.data();
    existingSubs[d.id] = { name: data.name, categoryId: data.categoryId || data.CATEGORYID };
  });
  console.log(`Subcategorias existentes: ${existingIds.size}`);

  // 2. Obtener categorias
  const catSnap = await db.collection('categories').get();
  const catMap = {};
  catSnap.docs.forEach(d => {
    catMap[d.id] = d.data().name;
  });
  console.log(`Categorias: ${catSnap.size}`);

  // 3. Obtener todos los productos y ver que subcategorias faltan
  const prodSnap = await db.collection('products').get();
  const missingSubs = {}; // subId -> { name, categoryId, count }
  
  for (const doc of prodSnap.docs) {
    const p = doc.data();
    const subId = p.SUBCATEGORYID;
    if (!subId || existingIds.has(subId)) continue;
    
    if (!missingSubs[subId]) {
      // Intentar obtener el nombre desde el producto
      const subName = p.SUBCATEGORYNAME || p.subcategory || p.subcategory_name || '';
      const catId = p.CATEGORYID || '';
      missingSubs[subId] = { 
        name: subName || '', 
        categoryId: catId, 
        count: 0,
        productNames: []
      };
    }
    missingSubs[subId].count++;
    if (missingSubs[subId].productNames.length < 3) {
      missingSubs[subId].productNames.push(p.NAME || '(sin nombre)');
    }
  }
  
  console.log(`\nSubcategorias faltantes: ${Object.keys(missingSubs).length}`);
  console.log('\n--- Detalle ---');
  for (const [id, info] of Object.entries(missingSubs)) {
    const catName = catMap[info.categoryId] || '(cat desconocida)';
    console.log(`\nID: ${id}`);
    console.log(`  Nombre: "${info.name}" | Cat: ${catName} (${info.categoryId}) | Productos: ${info.count}`);
    console.log(`  Ejemplos: ${info.productNames.join(', ')}`);
  }
  
  // 4. Para los que no tienen nombre, intentar obtenerlo de la API
  console.log('\n\n=== Subcats sin nombre ===');
  for (const [id, info] of Object.entries(missingSubs)) {
    if (!info.name) {
      console.log(`SIN NOMBRE: ${id} | cat: ${info.categoryId} | productos: ${info.count}`);
    }
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
