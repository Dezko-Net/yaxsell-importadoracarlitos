import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const sourceConfig = {
  apiKey: "AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A",
  authDomain: "geminai-449212.firebaseapp.com",
  projectId: "geminai-449212",
  storageBucket: "geminai-449212.firebasestorage.app",
  messagingSenderId: "786029583380",
  appId: "1:786029583380:web:c515391c5b673f4305db01",
};

const targetConfig = {
  apiKey: "AIzaSyCEcbWJSiDKXnAanhVb_hQ79fLbqeXpYYs",
  authDomain: "asistoraerp.firebaseapp.com",
  projectId: "asistoraerp",
  storageBucket: "asistoraerp.firebasestorage.app",
  messagingSenderId: "386824737987",
  appId: "1:386824737987:web:f85ebb6bae11190da3be76",
};

const sourceApp = initializeApp(sourceConfig, 'source');
const targetApp = initializeApp(targetConfig, 'target');
const sourceDb = getFirestore(sourceApp);
const targetDb = getFirestore(targetApp);

const RETRY = [
  'banners', 'orders', 'notifications', 'stock_alerts',
  'live_streams', 'banner_overlay_positions',
  'wholesale_orders', 'cart_items', 'cart_snapshots',
  'live_raffles', 'raffle_participants', 'product_views',
  'product_votes', 'product_questions', 'reviews',
  'discount_coupons', 'points_store_items',
  'vendors', 'vendor_orders', 'agencies',
  'cotizaciones', 'support_tickets', 'admin_chat',
  'stock_requests', 'stock_movements', 'order_status_history',
  'fcm_tokens', 'favorites', 'clips',
  'house_product_positions', 'hotspot_panels',
  'apertura_settings', 'store_settings', 'timed_offers',
];

async function migrateCollection(colName) {
  try {
    const snap = await getDocs(collection(sourceDb, colName));
    if (snap.empty) {
      console.log(`  ${colName}: vacía`);
      return 0;
    }
    const docs = snap.docs;
    let migrated = 0;
    const batchSize = 400;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = writeBatch(targetDb);
      const chunk = docs.slice(i, i + batchSize);
      for (const d of chunk) {
        const cleanData = JSON.parse(JSON.stringify(d.data()));
        batch.set(doc(targetDb, colName, d.id), cleanData);
      }
      await batch.commit();
      migrated += chunk.length;
    }
    console.log(`  ${colName}: ${migrated} docs OK`);
    return migrated;
  } catch (err) {
    console.error(`  ${colName}: ERROR - ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log('Reintentando colecciones fallidas...');
  let total = 0;
  for (const col of RETRY) {
    total += await migrateCollection(col);
  }
  console.log(`\nTotal: ${total} docs`);
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
