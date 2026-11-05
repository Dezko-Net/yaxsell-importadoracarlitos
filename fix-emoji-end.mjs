/**
 * Arregla las 9 subcategorias con emoji al final del nombre
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

const app = initializeApp({ credential: cert(cred) }, 'fix-emoji-end');
const db = getFirestore(app, databaseId);

const FIXES = {
  '6a6a9f79e3aed445c16c': '🍱',  // Almacenaje de Alimentos 🍱
  '6a8f2d2e3bf28bc54655': '🌳',  // Jardín y Exterior 🌳
  '6a8f2d3ff0a627587bcd': '🍽️',  // Textiles de Mesa 🍽️
  '6a8f2d6b7bb82298f582': '🍳',  // Dispensadores Cocina 🍳
  '6a8f2def586d281c15b4': '🛋️',  // Cojines y Fundas 🛋️
  '6a8f2e20ba2852984c3e': '🍖',  // Asados y Parrillas 🍖
  '6a8f2e5a7fe4587e6cb4': '🍽️',  // Mantelería y Textiles Mesa 🍽️
  '6a8f2e81bda4b10b460d': '🚪',  // Alfombras y Tapetes 🚪
  '6a8f2e8a5e0603c87fc4': '🍽️',  // Alfombras de Cocina 🍽️
  '6a8f2ee2bad7c32a5c8f': '🍽️',  // Mantelería y Textiles de Mesa 🍽️
  'sub_imagenes_rotas': '🔧',    // Imagenes Rotas
};

async function main() {
  const batch = db.batch();
  let count = 0;
  for (const [id, emoji] of Object.entries(FIXES)) {
    const ref = db.collection('subcategories').doc(id);
    batch.update(ref, { icon: emoji });
    count++;
    console.log(`  ${id} -> ${emoji}`);
  }
  await batch.commit();
  console.log(`\n${count} subcategorias arregladas.`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
