// Test directo: contar documentos en asistoraerp
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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

async function countCol(name) {
  try {
    const snap = await getDocs(collection(db, name));
    console.log(`${name}: ${snap.size} docs`);
  } catch (err) {
    console.log(`${name}: ERROR - ${err.message}`);
  }
}

async function main() {
  await countCol('products');
  await countCol('orders');
  await countCol('categories');
  await countCol('inventory_products');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
