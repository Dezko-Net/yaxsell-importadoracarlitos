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

const sTs = new Date('2026-06-01' + 'T00:00:00').getTime();
const eTs = new Date('2026-09-10' + 'T23:59:59').getTime();
console.log('Range:', sTs, '→', eTs);
console.log('Range:', new Date(sTs).toISOString(), '→', new Date(eTs).toISOString());

const snap = await db.collection('orders').get();
let total = 0, count = 0, inRange = 0, noCreatedat = 0;
let totalInRange = 0;
let statusCounts = {};
let sampleNoCreatedat = [];

for (const doc of snap.docs) {
  const d = doc.data();
  if (d._seed) continue;
  count++;
  total += d.TOTAL || 0;
  
  const ts = d.CREATEDAT;
  if (ts === undefined || ts === null) {
    noCreatedat++;
    if (sampleNoCreatedat.length < 3) sampleNoCreatedat.push({ id: doc.id, CREATEDAT: ts, $createdAt: d.$createdAt, STATUS: d.STATUS, TOTAL: d.TOTAL });
    continue;
  }
  
  if (typeof ts === 'number' && ts >= sTs && ts <= eTs) {
    inRange++;
    totalInRange += d.TOTAL || 0;
    statusCounts[d.STATUS] = (statusCounts[d.STATUS] || 0) + 1;
  }
}

console.log('\nTotal orders (non-seed):', count);
console.log('Orders with no CREATEDAT:', noCreatedat);
console.log('Sample no CREATEDAT:', JSON.stringify(sampleNoCreatedat, null, 2));
console.log('\nOrders in range 2026-06-01 → 2026-09-10:', inRange);
console.log('Total $ in range:', totalInRange);
console.log('Status counts in range:', JSON.stringify(statusCounts, null, 2));

// Verificar tipos de CREATEDAT
let types = {};
for (const doc of snap.docs) {
  const d = doc.data();
  if (d._seed) continue;
  const t = typeof d.CREATEDAT;
  types[t] = (types[t] || 0) + 1;
}
console.log('\nCREATEDAT types:', JSON.stringify(types));

process.exit(0);
