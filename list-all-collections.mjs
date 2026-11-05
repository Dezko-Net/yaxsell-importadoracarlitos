import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function main() {
  // Listar todas las colecciones raíz
  const collections = await db.listCollections();
  console.log('=== COLECCIONES RAÍZ EN FIRESTORE ===\n');
  for (const col of collections) {
    const snap = await db.collection(col.id).limit(1).get();
    const count = snap.size;
    let fields = '';
    if (snap.size > 0) {
      fields = Object.keys(snap.docs[0].data()).slice(0, 15).join(', ');
    }
    console.log(`${col.id} | docs: ${count > 0 ? 'tiene' : 'vacía'} | campos: ${fields}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
