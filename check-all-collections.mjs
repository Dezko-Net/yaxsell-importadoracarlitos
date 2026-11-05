import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function checkCol(name) {
  try {
    const snap = await getDocs(collection(db, name));
    if (snap.size > 0) {
      const firstDoc = snap.docs[0].data();
      const fields = Object.keys(firstDoc).slice(0, 8).join(', ');
      console.log(`${name}: ${snap.size} docs | campos: ${fields}`);
    } else {
      console.log(`${name}: 0 docs`);
    }
  } catch (err) {
    console.log(`${name}: ERROR - ${err.message}`);
  }
}

async function main() {
  const cols = [
    'products', 'orders', 'users', 'categories', 'subcategories',
    'banners', 'wholesale_orders', 'vendor_orders', 'store_settings',
    'theme_config', 'reviews', 'notifications', 'agencies',
    'sequences', 'favorites', 'addresses', 'timed_offers',
    'discount_coupons', 'stock_alerts', 'cart_items',
  ];
  for (const c of cols) {
    await checkCol(c);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
