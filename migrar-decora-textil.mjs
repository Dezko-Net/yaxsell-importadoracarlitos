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
const CAT_ID = '6a7f7545003c87cd0965';

const data = {
  name: 'Decora Textil',
  iconUrl: 'https://a-static.mlcdn.com.br/800x600/tapete-e-passadeiras-cozinha-e-casa-felpudo-algodao-rustico-estilo-boho-jogo-03-pecas-decora-textil/uphousecomerciovarejista/tapboh3pcbordcru/67901eda680652c610b1596552a58000.jpeg',
  order: 6,
  color: '#ededfd',
  BACKGROUND_IMAGE_URL: '',
  VENDOR_ID,
  $createdAt: '2026-08-14T20:06:29.941+00:00',
  $updatedAt: '2026-08-14T20:06:29.941+00:00',
};

await db.collection('categories').doc(CAT_ID).set(data, { merge: true });
console.log('Categoria Decora Textil creada/actualizada en Firebase con VENDOR_ID de Top Lucky');

const snap = await db.collection('categories').get();
console.log('Total categorias ahora:', snap.size);
for (const d of snap.docs) {
  const v = d.data();
  console.log(d.id, '|', v.name, '| VENDOR_ID:', v.VENDOR_ID || '__MAIN__');
}
process.exit(0);
