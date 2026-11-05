import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

const COLLECTIONS_TO_CREATE = [
  // Alta prioridad
  'discount_coupons',
  'store_settings',
  'apertura_settings',
  'vendors',
  'vendor_orders',
  'shipping_agencies',
  // Media prioridad
  'timed_offers',
  'wholesale_orders',
  'inventory_products',
  'blocked_products',
  // Baja prioridad
  'stock_alerts',
  'stock_requests',
  'notifications',
  'support_tickets',
  'reviews',
  'product_questions',
  'cart_items',
  'cart_snapshots',
  'product_groups',
  'product_views',
  'points_store_items',
  'hotspot_panels',
  'banners',
  'cotizaciones',
  'admin_chat',
  'product_votes',
  'clips',
  'live_streams',
  'live_raffles',
  'raffle_participants',
  'banner_overlay_positions',
  'house_product_positions',
  'catalog_products',
  'erp_config',
];

async function main() {
  const existing = await db.listCollections();
  const existingNames = new Set(existing.map(c => c.id));
  
  let created = 0;
  let skipped = 0;
  
  for (const col of COLLECTIONS_TO_CREATE) {
    if (existingNames.has(col)) {
      console.log(`  ✓ ${col}: ya existe`);
      skipped++;
      continue;
    }
    
    await db.collection(col).doc('_meta').set({
      _meta: true,
      createdAt: new Date().toISOString(),
      note: 'Placeholder para crear la colección. Eliminar cuando haya documentos reales.'
    });
    console.log(`  + ${col}: creada`);
    created++;
  }
  
  console.log(`\nTotal: ${created} creadas, ${skipped} ya existían`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
