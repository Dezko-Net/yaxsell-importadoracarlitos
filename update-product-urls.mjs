import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('products').get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const updates = {};
    let changed = false;

    for (const field of ['IMAGEURL', 'IMAGEURL2', 'IMAGEURL3', 'IMAGEURL4', 'IMAGEURL5']) {
      const url = data[field];
      if (!url) continue;
      
      // Si la URL no termina en .webp y apunta a una imagen comprimida, agregar .webp
      if (url.includes('asistoraerp.firebasestorage.app') && !url.endsWith('.webp')) {
        updates[field] = url + '.webp';
        changed = true;
      }
    }

    if (changed) {
      await doc.ref.update(updates);
      console.log(`  📝 ${doc.id}: ${JSON.stringify(Object.keys(updates))}`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\nActualizados: ${updated}`);
  console.log(`Sin cambios: ${skipped}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
