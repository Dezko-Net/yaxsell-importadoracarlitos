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
  const snap = await getDocs(collection(db, 'products'));
  let shown = 0;
  
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.IMAGEURL && String(data.IMAGEURL).trim() && shown < 5) {
      console.log(`\n=== ${d.id} ===`);
      console.log('  NAME:', data.NAME);
      console.log('  SKU:', data.SKU);
      console.log('  sku:', data.sku);
      console.log('  FEATURES:', JSON.stringify(data.FEATURES).substring(0, 200));
      console.log('  TAGS:', JSON.stringify(data.TAGS));
      console.log('  jumpseller_id:', data.jumpseller_id);
      console.log('  IMAGEURL:', String(data.IMAGEURL).substring(0, 100));
      shown++;
    }
  });
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
