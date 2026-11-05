/**
 * Extrae el emoji del nombre y lo guarda en el campo icon para todas las subcategorias
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

const app = initializeApp({ credential: cert(cred) }, 'emojis-all-subs');
const db = getFirestore(app, databaseId);

const emojiRegex = /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?)/u;

async function main() {
  const snap = await db.collection('subcategories').get();
  console.log(`Total subcategorias: ${snap.size}`);
  
  const batch = db.batch();
  let updated = 0;
  
  for (const doc of snap.docs) {
    if (doc.id === '_init') continue;
    const data = doc.data();
    const name = data.name || '';
    const currentIcon = data.icon || '';
    
    // Extraer emoji del nombre
    const m = name.match(emojiRegex);
    const emoji = m ? m[1] : '';
    
    if (emoji && !currentIcon) {
      batch.update(doc.ref, { icon: emoji });
      updated++;
      console.log(`  ${doc.id} | ${name} -> icon: ${emoji}`);
    } else if (currentIcon) {
      console.log(`  ${doc.id} | ${name} -> ya tiene icon: ${currentIcon}`);
    } else {
      console.log(`  ${doc.id} | ${name} -> SIN EMOJI en nombre, asignando 🏷️`);
      batch.update(doc.ref, { icon: '🏷️' });
      updated++;
    }
  }
  
  await batch.commit();
  console.log(`\n${updated} subcategorias actualizadas con icon.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
