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

// Query simple sin orderBy
console.log('--- Query products sin orderBy ---');
try {
  const q = await db.collection('products').where('VENDOR_ID', '==', '6a7f66541e7581429b18').limit(50).get();
  console.log('OK:', q.size, 'productos');
  for (const d of q.docs) {
    const p = d.data();
    console.log(' ', d.id, '|', p.NAME, '| VENDOR_ID=' + p.VENDOR_ID);
  }
} catch (e) {
  console.log('ERROR:', e.message);
}

console.log('\n--- Query vendor_orders sin orderBy ---');
try {
  const q = await db.collection('vendor_orders').where('VENDOR_ID', '==', '6a7f66541e7581429b18').limit(50).get();
  console.log('OK:', q.size, 'pedidos');
  for (const d of q.docs) {
    const o = d.data();
    console.log(' ', d.id, '|', o.ORDERCODE, '| STATUS=' + o.STATUS);
  }
} catch (e) {
  console.log('ERROR:', e.message);
}

process.exit(0);
