/**
 * Lista todas las subcategorias en Firestore
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

const app = initializeApp({ credential: cert(cred) }, 'list-all-subcats');
const db = getFirestore(app, databaseId);

async function main() {
  const snap = await db.collection('subcategories').get();
  console.log(`Total subcategorias: ${snap.size}\n`);
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`ID: ${doc.id} | name: ${d.name || '(sin nombre)'} | icon: ${d.icon || '(sin emoji)'} | categoryId: ${d.categoryId || d.CATEGORYID || ''}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
