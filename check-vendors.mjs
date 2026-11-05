import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local', 'utf-8');
const m = env.match(/GOOGLE_APPLICATION_CREDENTIALS_JSON=(.+)/);
let raw = m[1].trim();
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
const sa = JSON.parse(raw);
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app, 'donbalato');
db.settings({ ignoreUndefinedProperties: true });

const snap = await db.collection('vendors').get();
for (const d of snap.docs) {
  const v = d.data();
  console.log(v.NAME, '| LOGO_URL:', v.LOGO_URL);
}
process.exit(0);
