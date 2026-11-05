import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function checkCol(name) {
  try {
    const snap = await db.collection(name).limit(1).get();
    console.log(`${name}: ${snap.size} docs (limit 1)`);
    if (snap.size > 0) {
      const data = snap.docs[0].data();
      console.log(`  campos: ${Object.keys(data).slice(0, 10).join(', ')}`);
    }
  } catch (err) {
    console.log(`${name}: ERROR - ${err.message}`);
  }
}

async function main() {
  console.log('=== Verificando colecciones que toca firebase-usage ===\n');
  await checkCol('products');
  await checkCol('orders');
  await checkCol('inventory_products');
  await checkCol('categories');
  
  // Verificar si hay subcolecciones o algo raro
  console.log('\n=== Verificando productos con campos de imagen ===');
  const prodSnap = await db.collection('products').limit(3).get();
  for (const doc of prodSnap.docs) {
    const data = doc.data();
    console.log(`  ${doc.id}: IMAGES=${data.IMAGES ? 'sí' : 'no'}, IMAGE_URL=${data.IMAGE_URL ? 'sí' : 'no'}, MAIN_IMAGE=${data.MAIN_IMAGE ? 'sí' : 'no'}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
