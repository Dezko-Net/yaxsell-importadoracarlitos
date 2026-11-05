import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function main() {
  // Firestore no permite colecciones vacías — se crean con el primer documento.
  // Creamos un documento _meta en cada colección que servirá como placeholder.
  const collections = ['orders', 'addresses', 'sequences', 'favorites'];
  
  for (const col of collections) {
    const existing = await db.collection(col).limit(1).get();
    if (!existing.empty) {
      console.log(`${col}: ya existe (${existing.size} docs)`);
      continue;
    }
    
    await db.collection(col).doc('_meta').set({
      _meta: true,
      createdAt: new Date().toISOString(),
      note: 'Placeholder para crear la colección. Eliminar cuando haya documentos reales.'
    });
    console.log(`${col}: colección creada con doc _meta`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
