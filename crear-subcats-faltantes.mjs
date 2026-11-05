/**
 * Crea las 57 subcategorias faltantes en Firestore
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

const app = initializeApp({ credential: cert(cred) }, 'create-subs');
const db = getFirestore(app, databaseId);

async function main() {
  // 1. Obtener subcategorias existentes
  const snap = await db.collection('subcategories').get();
  const existingIds = new Set(snap.docs.map(d => d.id));
  console.log(`Subcategorias existentes: ${existingIds.size}`);

  // 2. Obtener todos los productos
  const prodSnap = await db.collection('products').get();
  const missingSubs = {};
  
  for (const doc of prodSnap.docs) {
    const p = doc.data();
    const subId = p.SUBCATEGORYID;
    if (!subId || existingIds.has(subId)) continue;
    
    if (!missingSubs[subId]) {
      const subName = p.SUBCATEGORYNAME || p.subcategory || p.subcategory_name || '';
      const catId = p.CATEGORYID || '';
      missingSubs[subId] = { name: subName || '', categoryId: catId };
    }
  }
  
  console.log(`Subcategorias a crear: ${Object.keys(missingSubs).length}`);
  
  // 3. Crear cada subcategoria con su ID original
  const batch = db.batch();
  let count = 0;
  for (const [id, info] of Object.entries(missingSubs)) {
    if (!info.name) {
      console.log(`  SKIP ${id} (sin nombre)`);
      continue;
    }
    const ref = db.collection('subcategories').doc(id);
    batch.set(ref, {
      name: info.name,
      categoryId: info.categoryId,
      parentSubcategoryId: null,
      order: 999
    });
    count++;
    console.log(`  + ${id} | ${info.name} | cat: ${info.categoryId}`);
  }
  
  await batch.commit();
  console.log(`\n${count} subcategorias creadas en Firestore.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
