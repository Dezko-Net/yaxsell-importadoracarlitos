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

const VENDOR_ID = '6a7f66541e7581429b18'; // Top Lucky
const DECORA_TEXTIL = '6a7f7545003c87cd0965';

const snap = await db.collection('products').get();
const toMove = [];
for (const d of snap.docs) {
  const p = d.data();
  const vendor = p.VENDOR_ID || '__MAIN__';
  if (vendor === VENDOR_ID) {
    toMove.push({ id: d.id, name: p.NAME || p.name, cat: p.CATEGORYID || p.CATEGORY });
  }
}
console.log(`Productos de Top Lucky a reasignar: ${toMove.length}`);

const batch = db.batch();
for (const p of toMove) {
  batch.update(db.collection('products').doc(p.id), { CATEGORYID: DECORA_TEXTIL });
  console.log('->', p.id, '|', p.name, '| cat anterior:', p.cat);
}
await batch.commit();
console.log('Reasignación completada a "Decora Textil"');
process.exit(0);
