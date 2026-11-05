import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('products').limit(5).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`Product ${doc.id}:`);
    for (const field of ['IMAGEURL', 'IMAGEURL2', 'IMAGEURL3', 'IMAGEURL4', 'IMAGEURL5']) {
      if (data[field]) {
        console.log(`  ${field}: ${data[field]}`);
      }
    }
    console.log('');
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
