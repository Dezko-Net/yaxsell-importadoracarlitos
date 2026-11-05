// Borra los productos ERP (que tienen campo "nombre" en lowercase) de asistoraerp
// y deja solo los productos Yaxsel (que tienen campo "NAME" en uppercase)
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';

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
  console.log('Listando todos los productos en asistoraerp...');
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Total docs: ${snap.size}`);
  
  let yaxselCount = 0;
  let erpCount = 0;
  const toDelete = [];
  
  snap.docs.forEach(d => {
    const data = d.data();
    // Yaxsel products have "NAME" field (uppercase)
    // ERP products have "nombre" field (lowercase)
    if (data.NAME !== undefined) {
      yaxselCount++;
    } else if (data.nombre !== undefined) {
      erpCount++;
      toDelete.push(d.id);
    } else {
      console.log(`  Unknown product: ${d.id}`, Object.keys(data).join(', '));
    }
  });
  
  console.log(`\nYaxsel products (NAME): ${yaxselCount}`);
  console.log(`ERP products (nombre): ${erpCount}`);
  console.log(`To delete: ${toDelete.length}`);
  
  // Delete ERP products in batches
  if (toDelete.length > 0) {
    console.log('\nDeleting ERP products...');
    const batchSize = 400;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = toDelete.slice(i, i + batchSize);
      for (const id of chunk) {
        batch.delete(doc(db, 'products', id));
      }
      await batch.commit();
      console.log(`  Deleted ${Math.min(i + batchSize, toDelete.length)}/${toDelete.length}...`);
    }
  }
  
  console.log(`\n✓ Done. Remaining: ${yaxselCount} Yaxsel products`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
