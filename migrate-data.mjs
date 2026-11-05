import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';

// Source: geminai-449212
const sourceConfig = {
  apiKey: "AIzaSyCIEgaE6Smuyz1YxfoKNXIgq76crN_Me7A",
  authDomain: "geminai-449212.firebaseapp.com",
  projectId: "geminai-449212",
  storageBucket: "geminai-449212.firebasestorage.app",
  messagingSenderId: "786029583380",
  appId: "1:786029583380:web:c515391c5b673f4305db01",
};

// Target: asistoraerp
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

const COLLECTIONS_TO_MIGRATE = [
  'products',
  'categories',
  'subcategories',
  'banners',
  'orders',
  'users',
  'timed_offers',
  'store_settings',
  'theme_config',
  'reviews',
  'product_questions',
  'discount_coupons',
  'points_store_items',
  'addresses',
  'sequences',
  'notifications',
  'admin_chat',
  'stock_alerts',
  'stock_requests',
  'favorites',
  'clips',
  'live_streams',
  'banner_overlay_positions',
  'house_product_positions',
  'hotspot_panels',
  'product_votes',
  'product_views',
  'apertura_settings',
  'vendors',
  'vendor_orders',
  'agencies',
  'cotizaciones',
  'support_tickets',
  'cart_items',
  'cart_snapshots',
  'live_raffles',
  'raffle_participants',
  'wholesale_orders',
  'wholesale_requests',
  'fcm_tokens',
  'order_status_history',
  'stock_movements',
];

async function migrateCollection(colName) {
  try {
    const snap = await getDocs(collection(sourceDb, colName));
    if (snap.empty) {
      console.log(`  ${colName}: vacía, saltando`);
      return 0;
    }

    const docs = snap.docs;
    let migrated = 0;
    
    // Batch writes (max 500 per batch)
    const batchSize = 400;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = writeBatch(targetDb);
      const chunk = docs.slice(i, i + batchSize);
      for (const d of chunk) {
        const data = d.data();
        // Remove any undefined values (Firestore doesn't accept them)
        const cleanData = JSON.parse(JSON.stringify(data));
        batch.set(doc(targetDb, colName, d.id), cleanData);
      }
      await batch.commit();
      migrated += chunk.length;
    }
    
    console.log(`  ${colName}: ${migrated} documentos migrados`);
    return migrated;
  } catch (err) {
    console.error(`  ${colName}: ERROR - ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log('Iniciando migración de geminai-449212 → asistoraerp');
  console.log(`Colecciones a migrar: ${COLLECTIONS_TO_MIGRATE.length}`);
  console.log('');
  
  let totalDocs = 0;
  for (const col of COLLECTIONS_TO_MIGRATE) {
    const count = await migrateCollection(col);
    totalDocs += count;
  }
  
  console.log('');
  console.log(`Migración completa. Total documentos: ${totalDocs}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
