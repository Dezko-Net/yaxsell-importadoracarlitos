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
  // Get products with IMAGEURL
  const snap = await getDocs(collection(db, 'products'));
  let withImage = 0;
  let withoutImage = 0;
  let shown = 0;
  
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.IMAGEURL && String(data.IMAGEURL).trim()) {
      withImage++;
      if (shown < 3) {
        console.log(`\n=== Product WITH IMAGE (id: ${d.id}) ===`);
        console.log('  NAME:', data.NAME);
        console.log('  SKU:', data.SKU);
        console.log('  sku:', data.sku);
        console.log('  IMAGEURL:', String(data.IMAGEURL).substring(0, 80));
        console.log('  source:', data.source);
        shown++;
      }
    } else {
      withoutImage++;
    }
  });
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`With image: ${withImage}`);
  console.log(`Without image: ${withoutImage}`);
  console.log(`Total: ${snap.size}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
