import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

// Todas las colecciones que referencia el código
const ALL_COLLECTIONS = [
  'products', 'inventory_products', 'catalog_products', 'categories',
  'banners', 'orders', 'wholesale_orders', 'timed_offers', 'sequences',
  'discount_coupons', 'points_store_items', 'users', 'live_streams',
  'banner_overlay_positions', 'house_product_positions', 'hotspot_panels',
  'product_votes', 'subcategories', 'reviews', 'product_questions',
  'clips', 'favorites', 'cart_items', 'cart_snapshots', 'live_raffles',
  'raffle_participants', 'stock_alerts', 'stock_requests', 'notifications',
  'theme_config', 'apertura_settings', 'product_views', 'store_settings',
  'admin_chat', 'addresses', 'cotizaciones', 'support_tickets',
  'vendors', 'vendor_orders', 'agencies',
  // Extras del ERP
  'admin_supreme', 'app_users', 'catalogs_config',
];

async function main() {
  // Listar colecciones que existen
  const existing = await db.listCollections();
  const existingNames = new Set(existing.map(c => c.id));
  
  console.log('=== COLECCIONES EN FIREBASE ===\n');
  for (const col of ALL_COLLECTIONS) {
    const exists = existingNames.has(col);
    let count = 0;
    if (exists) {
      try {
        const snap = await db.collection(col).count().get();
        count = snap.data().count;
      } catch (e) {
        count = -1;
      }
    }
    const status = exists ? `${count} docs` : 'NO EXISTE';
    const icon = exists ? (count > 0 ? '✓' : '◯') : '✗';
    console.log(`  ${icon} ${col}: ${status}`);
  }
  
  // Verificar si hay colecciones en Firebase que no están en la lista
  console.log('\n=== COLECCIONES EN FIREBASE NO LISTADAS ===\n');
  for (const col of existing) {
    if (!ALL_COLLECTIONS.includes(col.id)) {
      console.log(`  ? ${col.id}`);
    }
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
