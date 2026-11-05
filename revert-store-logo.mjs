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

// Revertir: quitar LOGOURL y logoUrl, dejar STORENAME como estaba
const colRef = db.collection('store_settings');
const snap = await colRef.get();
const batch = db.batch();
snap.docs.forEach(d => {
  batch.set(d.ref, { LOGOURL: '', logoUrl: '' }, { merge: true });
});
batch.set(colRef.doc('main'), { LOGOURL: '', logoUrl: '' }, { merge: true });
await batch.commit();
console.log('Revertido: logoUrl quitado de store_settings');
process.exit(0);
