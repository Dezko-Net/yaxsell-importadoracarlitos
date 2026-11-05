import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, deleteDoc } from 'firebase/firestore';

const config = {
  apiKey: "AIzaSyCEcbWJSiDKXnAanhVb_hQ79fLbqeXpYYs",
  authDomain: "asistoraerp.firebaseapp.com",
  projectId: "asistoraerp",
  storageBucket: "asistoraerp.firebasestorage.app",
  messagingSenderId: "386824737987",
  appId: "1:386824737987:web:f85ebb6bae11190da3be76",
};

const app = initializeApp(config);
const db = getFirestore(app);

async function deleteCollection(name) {
  try {
    const snap = await getDocs(collection(db, name));
    if (snap.size === 0) {
      console.log(`${name}: 0 docs, nada que borrar`);
      return 0;
    }
    
    let deleted = 0;
    const docs = snap.docs;
    const batchSize = 400;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + batchSize);
      for (const d of chunk) {
        batch.delete(doc(db, name, d.id));
      }
      await batch.commit();
      deleted += chunk.length;
      console.log(`  ${name}: borrados ${deleted}/${snap.size}`);
    }
    
    console.log(`${name}: ${deleted} docs borrados`);
    return deleted;
  } catch (err) {
    console.log(`${name}: ERROR - ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log('Borrando colecciones...\n');
  
  const toDelete = ['orders', 'users', 'theme_config', 'addresses', 'sequences'];
  
  let total = 0;
  for (const col of toDelete) {
    const count = await deleteCollection(col);
    total += count;
  }
  
  console.log(`\nTotal borrado: ${total} documentos`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
