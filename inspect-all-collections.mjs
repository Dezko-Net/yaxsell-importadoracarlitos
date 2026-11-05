import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const config = {
  apiKey: "AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A",
  authDomain: "geminai-449212.firebaseapp.com",
  projectId: "geminai-449212",
  storageBucket: "geminai-449212.firebasestorage.app",
  messagingSenderId: "786029583380",
  appId: "1:786029583380:web:c515391c5b673f4305db01",
};

const app = initializeApp(config);
const db = getFirestore(app);

async function checkCol(name) {
  try {
    const snap = await getDocs(query(collection(db, name), limit(2)));
    if (snap.empty) {
      console.log(`\n=== ${name}: vacía ===`);
      return;
    }
    console.log(`\n=== ${name} (${snap.size} docs mostrados) ===`);
    snap.docs.forEach((d, i) => {
      const data = d.data();
      const keys = Object.keys(data).sort();
      console.log(`  Doc ${i+1} (id: ${d.id}): ${keys.join(', ')}`);
      // Show a few key fields
      const sample = {};
      for (const k of keys.slice(0, 8)) sample[k] = data[k];
      console.log(`  Sample:`, JSON.stringify(sample).substring(0, 300));
    });
  } catch (err) {
    console.log(`\n=== ${name}: ERROR - ${err.message} ===`);
  }
}

async function main() {
  // Check all product-related collections
  const cols = [
    'products', 'inventory_products', 'catalog_products',
    'categories', 'subcategories', 'banners', 'orders',
    'store_settings', 'theme_config', 'users',
  ];
  
  for (const c of cols) {
    await checkCol(c);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
