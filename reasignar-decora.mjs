import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local', 'utf-8');
const m = env.match(/GOOGLE_APPLICATION_CREDENTIALS_JSON=(.+)/);
let raw = m[1].trim();
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
const sa = JSON.parse(raw);
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(sa) });
const db = getFirestore(app, 'donbalato');
db.settings({ ignoreUndefinedProperties: true });

const OLD_CAT = '6a7f7545003c87cd0965'; // Decora Textil (ahora de Top Lucky)
const NEW_CAT = 'cat_hogar_cocina';    // Hogar y Cocina (principal)

// Buscar productos principales (__MAIN__) asignados a Decora Textil
const snap = await db.collection('products').get();
const toMove = [];
for (const d of snap.docs) {
  const p = d.data();
  const cat = p.CATEGORYID || p.CATEGORY;
  const vendor = p.VENDOR_ID || '__MAIN__';
  if (cat === OLD_CAT && vendor === '__MAIN__') {
    toMove.push({ id: d.id, name: p.NAME || p.name });
  }
}
console.log(`Productos a reasignar: ${toMove.length}`);

const batch = db.batch();
for (const p of toMove) {
  batch.update(db.collection('products').doc(p.id), { CATEGORYID: NEW_CAT });
  console.log('->', p.id, '|', p.name);
}
await batch.commit();
console.log('Reasignación completada a "Hogar y Cocina"');

// Verificar
const snap2 = await db.collection('products').get();
const still = [];
for (const d of snap2.docs) {
  const p = d.data();
  const cat = p.CATEGORYID || p.CATEGORY;
  const vendor = p.VENDOR_ID || '__MAIN__';
  if (cat === OLD_CAT && vendor === '__MAIN__') still.push(d.id);
}
console.log('Productos __MAIN__ restantes en Decora Textil:', still.length);
process.exit(0);
