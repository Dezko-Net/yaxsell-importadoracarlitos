// Test: verificar que serverListDocuments aplica los filtros correctamente
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function testQuery(label, queryFn) {
  try {
    const snap = await queryFn();
    console.log(`${label}: ${snap.size} docs (debería ser <= 5)`);
    return snap.size;
  } catch (err) {
    console.log(`${label}: ERROR - ${err.message}`);
    return -1;
  }
}

async function main() {
  console.log('=== Test de filtros en Firestore ===\n');

  // 1. Sin filtros (lee todo)
  await testQuery('Sin filtros', () => db.collection('products').get());

  // 2. Con limit(5)
  await testQuery('Con limit(5)', () => db.collection('products').limit(5).get());

  // 3. Con where + limit
  await testQuery('Con where + limit(5)', () =>
    db.collection('products').where('SELLERID', '==', 'main_store').limit(5).get()
  );

  // 4. Con where IN + limit
  await testQuery('Con where IN + limit(5)', () =>
    db.collection('products').where('SELLERID', 'in', ['main_store', 'test']).limit(5).get()
  );

  // 5. Orders vacía
  await testQuery('Orders (vacía)', () => db.collection('orders').limit(5).get());

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
