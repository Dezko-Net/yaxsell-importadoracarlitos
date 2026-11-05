import { initializeApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const bucket = getStorage(app).bucket();
const db = getFirestore(app);

async function main() {
  // List all files in Storage
  const [files] = await bucket.getFiles({ prefix: 'yaxsell/' });
  const existingNames = new Set(files.map(f => f.name));
  
  console.log(`Archivos en Storage: ${files.length}`);
  
  // Check each product URL
  const snap = await db.collection('products').get();
  let fixed = 0;
  let ok = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const updates = {};
    let changed = false;

    for (const field of ['IMAGEURL', 'IMAGEURL2', 'IMAGEURL3', 'IMAGEURL4', 'IMAGEURL5']) {
      const url = data[field];
      if (!url) continue;
      
      // Extract file path from URL
      // URL format: https://storage.googleapis.com/asistoraerp.firebasestorage.app/yaxsell/Donbalato%20Ivan/FILENAME
      const match = url.match(/asistoraerp\.firebasestorage\.app\/(.+)$/);
      if (!match) continue;
      
      const filePath = decodeURIComponent(match[1]);
      
      // Check if the file exists in Storage
      if (!existingNames.has(filePath)) {
        // File doesn't exist - try without .webp
        const withoutWebp = filePath.replace(/\.webp$/, '');
        if (existingNames.has(withoutWebp)) {
          // The original file exists, revert URL
          updates[field] = url.replace(/\.webp$/, '');
          changed = true;
          console.log(`  🔧 ${doc.id} ${field}: revertir .webp (archivo no existe)`);
        } else {
          console.log(`  ❌ ${doc.id} ${field}: archivo no encontrado en Storage: ${filePath}`);
        }
      }
    }

    if (changed) {
      await doc.ref.update(updates);
      fixed++;
    } else {
      ok++;
    }
  }

  console.log(`\nArreglados: ${fixed}`);
  console.log(`OK: ${ok}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
