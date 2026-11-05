import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, orderBy } from 'firebase/firestore';

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

async function main() {
  const snap = await getDocs(query(collection(db, 'products'), limit(3)));
  snap.docs.forEach((d, i) => {
    console.log(`\n=== PRODUCT ${i+1} (id: ${d.id}) ===`);
    const data = d.data();
    const keys = Object.keys(data).sort();
    console.log('Fields:', keys.join(', '));
    console.log('Full data:');
    console.log(JSON.stringify(data, null, 2));
  });
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
