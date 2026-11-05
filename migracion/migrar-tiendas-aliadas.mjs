#!/usr/bin/env node
/**
 * migracion/migrar-tiendas-aliadas.mjs
 *
 * Migra las colecciones `vendors` y `vendor_orders` desde Appwrite producción
 * (proyecto 'donbalatoivan') hacia Firebase Firestore ('donbalato').
 *
 * Preserva IDs de documento y todos los campos de datos.
 * Omite campos internos de Appwrite ($collectionId, $databaseId, $permissions, $createdAt, $updatedAt).
 *
 * Uso:  node migracion/migrar-tiendas-aliadas.mjs
 */

import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// ─── Appwrite origen ───────────────────────────────────────────
const APPWRITE_KEY = 'standard_6cd1375a55fe6d93b6f0857404f29b5d3333dbf496213b6bea1afe3a0ead6c4489f9400f3cc3700c9f65573d5580239a5284aa99ea21f44cf07af1c96426aacc3ee9564048c035e0e5b26467316d9e56df117f52443748ff31cabfcaf1d336a0ef0519ede8e2924534aff4c7d98de556ba8ef52050cb6a349f8d4373faf46982';
const APPWRITE_PROJECT = 'donbalatoivan';
const APPWRITE_DATABASE_ID = '6a62e7440033d2278d28';
const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';

const APPWRITE_HEADERS = {
  'X-Appwrite-Project': APPWRITE_PROJECT,
  'X-Appwrite-Key': APPWRITE_KEY,
  'Content-Type': 'application/json',
};

// ─── Firebase destino ──────────────────────────────────────────
const DATABASE_ID = 'donbalato';
const BATCH_SIZE = 400; // Firestore batch limit: 500 ops

// Campos internos de Appwrite que NO se migran
const AW_INTERNAL_KEYS = new Set([
  '$id', '$collectionId', '$databaseId', '$permissions', '$createdAt', '$updatedAt', '$read', '$write',
]);

// ─── Firebase init ─────────────────────────────────────────────
async function getFirebaseDb() {
  const env = readFileSync('.env.local', 'utf-8');
  const match = env.match(/GOOGLE_APPLICATION_CREDENTIALS_JSON=(.+)/);
  if (!match) {
    throw new Error('No se encontró GOOGLE_APPLICATION_CREDENTIALS_JSON en .env.local');
  }
  let raw = match[1].trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  const sa = JSON.parse(raw);
  if (sa.private_key && typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(sa),
    storageBucket: 'yaxselldemo.firebasestorage.app',
  });
  const db = getFirestore(app, DATABASE_ID);
  db.settings({ ignoreUndefinedProperties: true });
  return { app, db };
}

// ─── Descarga un archivo desde una URL ────────────────────────
async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Appwrite fetch con paginación ────────────────────────────
async function fetchAllAppwriteDocuments(collectionId) {
  const all = [];
  let offset = 0;
  const limit = 100;

  console.log(`  [Appwrite] Leyendo colección "${collectionId}"...`);

  while (true) {
    const qLimit = JSON.stringify({ method: 'limit', values: [limit] });
    const qOffset = JSON.stringify({ method: 'offset', values: [offset] });
    const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DATABASE_ID}/collections/${collectionId}/documents?queries[]=${encodeURIComponent(qLimit)}&queries[]=${encodeURIComponent(qOffset)}`;

    const res = await fetch(url, { headers: APPWRITE_HEADERS });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Appwrite ${collectionId} fetch failed (${res.status}): ${err.message || res.statusText}`);
    }
    const data = await res.json();
    const docs = data.documents || [];
    if (!docs.length) break;

    all.push(...docs);
    console.log(`    ...${all.length} documentos leídos`);
    if (docs.length < limit) break;
    offset += limit;
  }

  return all;
}

// ─── Limpia campos internos de Appwrite ───────────────────────
function cleanDoc(doc) {
  const clean = {};
  for (const key of Object.keys(doc)) {
    if (AW_INTERNAL_KEYS.has(key)) continue;
    const val = doc[key];
    if (val === undefined) continue;
    // Appwrite puede devolver objetos anidados; Firestore no soporta undefined
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const nested = {};
      for (const nk of Object.keys(val)) {
        if (val[nk] !== undefined) nested[nk] = val[nk];
      }
      clean[key] = nested;
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

// ─── Escribe documentos a Firestore en lotes ───────────────────
async function writeToFirestore(db, collectionId, docs) {
  let written = 0;
  let skipped = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const doc of chunk) {
      const docId = doc['$id'];
      if (!docId) { skipped++; continue; }
      const data = cleanDoc(doc);
      // Preservar timestamps de Appwrite como strings
      if (doc['$createdAt']) data.$createdAt = doc['$createdAt'];
      if (doc['$updatedAt']) data.$updatedAt = doc['$updatedAt'];
      batch.set(db.collection(collectionId).doc(docId), data, { merge: true });
      written++;
    }

    await batch.commit();
    console.log(`    ...${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length} escritos en Firestore`);
  }

  return { written, skipped };
}

// ─── Verifica documentos ya existentes ────────────────────────
async function countExisting(db, collectionId) {
  const snap = await db.collection(collectionId).count().get();
  return snap.data().count;
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🚀 MIGRACIÓN DE TIENDAS ALIADAS: APPWRITE -> FIREBASE');
  console.log('   Colecciones: vendors, vendor_orders');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { app, db } = await getFirebaseDb();
  const bucket = getStorage(app).bucket();

  const COLLECTIONS = [
    { id: 'vendors',       name: 'Tiendas Aliadas (Vendors)' },
    { id: 'vendor_orders', name: 'Pedidos de Tiendas Aliadas' },
  ];

  for (const col of COLLECTIONS) {
    console.log(`\n📋 Migrando "${col.name}" (${col.id})`);

    // 1. Leer de Appwrite
    const awDocs = await fetchAllAppwriteDocuments(col.id);
    console.log(`   ✓ ${awDocs.length} documentos en Appwrite`);

    if (awDocs.length === 0) {
      console.log('   (colección vacía, saltando)');
      continue;
    }

    // 2. Verificar existentes en Firebase
    const existingCount = await countExisting(db, col.id);
    console.log(`   ℹ️  ${existingCount} documentos ya existen en Firebase Firestore`);

    // 3. Si es vendors, migrar logos desde Appwrite Storage a Firebase Storage
    if (col.id === 'vendors') {
      console.log('   🔄 Migrando logos desde Appwrite Storage...');
      for (const doc of awDocs) {
        const logoUrl = doc.LOGO_URL || '';
        const vendorName = doc.NAME || doc.$id;
        if (!logoUrl) {
          console.log(`     ⚠  "${vendorName}" — sin LOGO_URL, saltando`);
          continue;
        }
        // Si ya es URL de Firebase Storage, saltar
        if (logoUrl.includes('firebasestorage.app') || logoUrl.includes('firebasestorage.googleapis.com')) {
          console.log(`     ✓  "${vendorName}" — logo ya en Firebase Storage`);
          continue;
        }
        try {
          console.log(`     📥 Descargando logo de "${vendorName}" desde Appwrite...`);
          const logoBuffer = await downloadFile(logoUrl);
          const ext = logoUrl.match(/\.(png|jpg|jpeg|webp|gif|svg)/i)?.[1]?.toLowerCase() || 'png';
          const safeName = (vendorName || 'vendor').replace(/[^A-Za-z0-9]/g, '_');
          const fileName = `vendors/${safeName}.${ext}`;
          const file = bucket.file(fileName);
          console.log(`     📤 Subiendo a Firebase Storage: ${fileName}...`);
          await file.save(logoBuffer, {
            metadata: { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
            public: true,
          });
          const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2030' });
          console.log(`     🔗 URL: ${url.substring(0, 80)}...`);
          // Actualizar el LOGO_URL en el documento antes de escribir a Firestore
          doc.LOGO_URL = url;
        } catch (e) {
          console.log(`     ✗  "${vendorName}" — error migrando logo: ${e.message}`);
        }
      }
    }

    // 4. Escribir a Firestore
    const { written, skipped } = await writeToFirestore(db, col.id, awDocs);
    console.log(`   ✅ ${written} documentos escritos, ${skipped} saltados`);

    // 5. Verificación final
    const finalCount = await countExisting(db, col.id);
    console.log(`   ✓ Total en Firebase ahora: ${finalCount}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ MIGRACIÓN DE TIENDAS ALIADAS COMPLETADA');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err);
  process.exit(1);
});
