import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function countDocs(colId) {
  const snap = await db.collection(colId).count().get();
  return snap.data().count;
}

async function getSample(colId) {
  const snap = await db.collection(colId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function main() {
  const cols = ['admin_supreme', 'app_users', 'catalogs_config', 'categories', 'products', 'subcategories', 'users'];
  
  for (const col of cols) {
    const count = await countDocs(col);
    const sample = await getSample(col);
    console.log(`\n=== ${col} (${count} docs) ===`);
    if (sample) {
      console.log(JSON.stringify(sample, null, 2).slice(0, 2000));
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
