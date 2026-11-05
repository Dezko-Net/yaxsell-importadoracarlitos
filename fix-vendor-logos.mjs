import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local', 'utf-8');
const m = env.match(/GOOGLE_APPLICATION_CREDENTIALS_JSON=(.+)/);
let raw = m[1].trim();
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
const sa = JSON.parse(raw);
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const app = initializeApp({ credential: cert(sa), storageBucket: 'yaxselldemo.firebasestorage.app' });
const bucket = getStorage(app).bucket();
const db = getFirestore(app, 'donbalato');
db.settings({ ignoreUndefinedProperties: true });

// Hacer público el logo de BalatinTest
const file = bucket.file('vendors/BalatinTest.png');
await file.makePublic();
const publicUrl = `https://storage.googleapis.com/yaxselldemo.firebasestorage.app/vendors/BalatinTest.png`;
console.log('URL pública:', publicUrl);

// Actualizar en Firestore
const snap = await db.collection('vendors').get();
for (const d of snap.docs) {
  const v = d.data();
  if (v.NAME === 'BalatinTest') {
    await d.ref.update({ LOGO_URL: publicUrl });
    console.log('Actualizado BalatinTest con URL pública');
  }
}

process.exit(0);
