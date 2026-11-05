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

const app = initializeApp({ credential: cert(cred) }, 'check-subs');
const db = getFirestore(app, databaseId);

async function main() {
  const snap = await db.collection('subcategories').get();
  console.log(`Subcategorias en Firestore: ${snap.size}`);
  const ids = snap.docs.map(d => d.id);
  
  const prodSnap = await db.collection('products').get();
  const subIds = new Set();
  prodSnap.docs.forEach(d => {
    const s = d.data().SUBCATEGORYID;
    if (s) subIds.add(s);
  });
  console.log(`SUBCATEGORYIDs unicos en productos: ${subIds.size}`);
  
  const missing = [...subIds].filter(id => !ids.includes(id));
  console.log(`Subcats que NO existen en Firestore pero si en productos: ${missing.length}`);
  missing.forEach(id => console.log(`  ${id}`));
  
  // Tambien ver las subcats que existen pero no tienen productos
  const orphan = ids.filter(id => !subIds.has(id));
  console.log(`\nSubcats en Firestore sin productos asignados: ${orphan.length}`);
  orphan.forEach(id => {
    const doc = snap.docs.find(d => d.id === id);
    console.log(`  ${id} | ${doc.data().name || '(sin nombre)'}`);
  });
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
