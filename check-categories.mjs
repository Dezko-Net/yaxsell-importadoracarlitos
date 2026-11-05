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

const snap = await db.collection('categories').get();
console.log('total categories:', snap.size);
for (const d of snap.docs) {
  const data = d.data();
  console.log(d.id, '|', data.name || data.NAME, '| VENDOR_ID:', data.VENDOR_ID || '__MAIN__');
}
process.exit(0);
