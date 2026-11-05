/**
 * Cambia el nombre de la tienda en store_settings de "Yaxsell Demo" a "Importadora Carlitos"
 */
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.substring(0, eqIdx).trim();
    const val = line.substring(eqIdx + 1).replace(/^["']|["']$/g, '').trim();
    process.env[key] = val;
  }
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'yaxselldemo';
const databaseId = process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'donbalato';

let cred;
const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (credJson) {
  cred = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;
  if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
} else {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  cred = { projectId, clientEmail, privateKey };
}

const app = initializeApp({ credential: cert(cred) }, 'fix-store-name');
const db = getFirestore(app, databaseId);

async function main() {
  const snap = await db.collection('store_settings').get();
  console.log(`Documentos en store_settings: ${snap.size}`);
  
  for (const doc of snap.docs) {
    const data = doc.data();
    const currentName = data.STORENAME || data.storeName || '';
    console.log(`  Doc: ${doc.id} | STORENAME: ${currentName}`);
    
    if (currentName === 'Yaxsell Demo' || currentName === 'yaxsell demo' || currentName.toLowerCase().includes('yaxsell')) {
      console.log(`  -> Cambiando a "Importadora Carlitos"`);
      await doc.ref.update({ STORENAME: 'Importadora Carlitos', storeName: 'Importadora Carlitos' });
      console.log(`  -> Actualizado!`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
