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

const vendors = await db.collection('vendors').get();
const products = await db.collection('products').get();
const orders = await db.collection('vendor_orders').get();
for (const vendor of vendors.docs) {
  const id = vendor.id;
  const data = vendor.data();
  if (!data.NAME || !data.EMAIL) continue;
  const vp = products.docs.filter(d => d.data().VENDOR_ID === id);
  const vo = orders.docs.filter(d => d.data().VENDOR_ID === id);
  console.log(`${data.NAME}: productos=${vp.length}, pedidos=${vo.length}, logo=${Boolean(data.LOGO_URL)}`);
}
console.log(`Totales Firebase: products=${products.size}, vendor_orders=${orders.size}`);
