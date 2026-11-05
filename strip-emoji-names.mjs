/**
 * Quita el emoji del nombre de las subcategorias (lo deja solo en icon)
 */
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envPath = path.join(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf-8');
for (const line of content.split('\n')) {
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) continue;
  const key = line.substring(0, eqIdx).trim();
  const val = line.substring(eqIdx + 1).replace(/^["']|["']$/g, '').trim();
  process.env[key] = val;
}

const databaseId = process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'donbalato';
let cred = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const app = initializeApp({ credential: cert(cred) }, 'strip-emoji');
const db = getFirestore(app, databaseId);

const emojiRegex = /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?)\s*/u;
const trailingEmojiRegex = /\s*(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?)\s*$/u;

async function main() {
  const snap = await db.collection('subcategories').get();
  console.log(`Total: ${snap.size}`);
  
  const batch = db.batch();
  let count = 0;
  
  for (const doc of snap.docs) {
    if (doc.id === '_init') continue;
    const data = doc.data();
    const name = data.name || '';
    let cleanName = name;
    
    // Quitar emoji al inicio
    cleanName = cleanName.replace(emojiRegex, '');
    // Quitar emoji al final
    cleanName = cleanName.replace(trailingEmojiRegex, '');
    // Limpiar espacios
    cleanName = cleanName.trim();
    
    if (cleanName !== name) {
      batch.update(doc.ref, { name: cleanName });
      count++;
      console.log(`  ${doc.id} | "${name}" -> "${cleanName}"`);
    }
  }
  
  await batch.commit();
  console.log(`\n${count} subcategorias limpiadas.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
