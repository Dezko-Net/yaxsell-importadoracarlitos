import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local', 'utf-8');
const match = env.match(/GOOGLE_APPLICATION_CREDENTIALS_JSON=(.+)/);
let raw = match[1].trim();
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
  raw = raw.slice(1, -1);
}
const sa = JSON.parse(raw);
if (sa.private_key && typeof sa.private_key === 'string') {
  sa.private_key = sa.private_key.replace(/\\n/g, '\n');
}
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(sa) });
const db = getFirestore(app, 'donbalato');

async function main() {
  const snap = await db.collection('products').get();
  let donbalatoCount = 0;
  let awCount = 0;
  let otherCount = 0;

  let awUnlimitedStock = 0;
  let awWebPublished = 0;

  snap.docs.forEach((d) => {
    const data = d.data();
    if (d.id.startsWith('donbalato_')) {
      donbalatoCount++;
    } else if (d.id.startsWith('aw_') || data.source === 'appwrite') {
      awCount++;
      if (Number(data.STOCK) >= 99999 || data.unlimited_stock) awUnlimitedStock++;
      if (data.SHOW_IN_WEB) awWebPublished++;
    } else {
      otherCount++;
    }
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 AUDITORÍA DE PRODUCTOS EN FIRESTORE');
  console.log('═══════════════════════════════════════════════');
  console.log(`Total documentos:                   ${snap.size}`);
  console.log(`Importadora Carlitos (Tienda POS física):     ${donbalatoCount}`);
  console.log(`Appwrite (Temporales importados):   ${awCount}`);
  console.log(`  - Con stock ilimitado (99999):    ${awUnlimitedStock}`);
  console.log(`  - Publicados en la Web:           ${awWebPublished}`);
  console.log(`Otros:                              ${otherCount}\n`);
}

main().catch(console.error);
