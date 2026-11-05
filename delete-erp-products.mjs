// Borra los productos ERP (source='erp') de asistoraerp
// Deja solo los 266 productos Yaxsel con imagen
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

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

async function main() {
  console.log('Listando productos...');
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Total: ${snap.size}`);

  const toDelete = [];
  let yaxselCount = 0;

  snap.docs.forEach(d => {
    const data = d.data();
    if (data.source === 'erp') {
      toDelete.push(d.id);
    } else {
      yaxselCount++;
    }
  });

  console.log(`Yaxsel (kept): ${yaxselCount}`);
  console.log(`ERP (delete): ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('Nada que borrar.');
    process.exit(0);
  }

  console.log('\nBorrando...');
  const batchSize = 400;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = toDelete.slice(i, i + batchSize);
    for (const id of chunk) {
      batch.delete(doc(db, 'products', id));
    }
    await batch.commit();
    console.log(`  ${Math.min(i + batchSize, toDelete.length)}/${toDelete.length}`);
  }

  const finalSnap = await getDocs(collection(db, 'products'));
  console.log(`\n✓ Done. Productos restantes: ${finalSnap.size}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
