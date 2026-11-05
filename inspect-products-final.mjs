import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, where } from 'firebase/firestore';

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
  // Check Yaxsel products (with IMAGEURL)
  const snap = await getDocs(query(collection(db, 'products'), limit(5)));
  snap.docs.forEach((d, i) => {
    const data = d.data();
    console.log(`\n=== Product ${i+1} (id: ${d.id}) ===`);
    console.log('  NAME:', data.NAME);
    console.log('  SKU:', data.SKU);
    console.log('  sku:', data.sku);
    console.log('  IMAGEURL:', data.IMAGEURL);
    console.log('  source:', data.source);
    console.log('  FEATURES:', data.FEATURES);
    console.log('  TAGS:', data.TAGS);
  });
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
