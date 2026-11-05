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

const LOGO_URL = 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785649686695-pegada-1785649685558.png';

const colRef = db.collection('store_settings');
const snap = await colRef.get();
if (snap.empty) {
  await colRef.doc('main').set({ STORENAME: 'Importadora Carlitos', LOGOURL: LOGO_URL, logoUrl: LOGO_URL }, { merge: true });
  console.log('Creado store_settings/main con Importadora Carlitos y logo');
} else {
  const batch = db.batch();
  snap.docs.forEach(d => {
    batch.set(d.ref, { STORENAME: 'Importadora Carlitos', LOGOURL: LOGO_URL, logoUrl: LOGO_URL }, { merge: true });
  });
  batch.set(colRef.doc('main'), { STORENAME: 'Importadora Carlitos', LOGOURL: LOGO_URL, logoUrl: LOGO_URL }, { merge: true });
  await batch.commit();
  console.log('Actualizados', snap.size, 'docs de store_settings con Importadora Carlitos y logo');
}

const verify = await colRef.doc('main').get();
console.log('Verificacion:', JSON.stringify({ STORENAME: verify.data()?.STORENAME, logoUrl: verify.data()?.logoUrl }));
process.exit(0);
