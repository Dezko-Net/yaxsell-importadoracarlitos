#!/usr/bin/env node
/**
 * migracion/migrar-agencias-logos.mjs
 *
 * Descarga los logos de las agencias desde Appwrite Storage
 * y los sube a Firebase Storage en la carpeta 'agencias/'.
 * Actualiza el campo 'logo' en Firestore con la nueva URL.
 */

import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const APPWRITE_KEY = 'standard_6cd1375a55fe6d93b6f0857404f29b5d3333dbf496213b6bea1afe3a0ead6c4489f9400f3cc3700c9f65573d5580239a5284aa99ea21f44cf07af1c96426aacc3ee9564048c035e0e5b26467316d9e56df117f52443748ff31cabfcaf1d336a0ef0519ede8e2924534aff4c7d98de556ba8ef52050cb6a349f8d4373faf46982';
const APPWRITE_PROJECT = 'donbalatoivan';
const APPWRITE_DATABASE_ID = '6a62e7440033d2278d28';
const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';

const APPWRITE_HEADERS = {
  'X-Appwrite-Project': APPWRITE_PROJECT,
  'X-Appwrite-Key': APPWRITE_KEY,
  'Content-Type': 'application/json',
};

const DATABASE_ID = 'donbalato';

async function getFirebaseDb() {
  const env = readFileSync('.env.local', 'utf-8');
  const match = env.match(/GOOGLE_APPLICATION_CREDENTIALS_JSON=(.+)/);
  if (!match) throw new Error('No se encontró GOOGLE_APPLICATION_CREDENTIALS_JSON en .env.local');
  let raw = match[1].trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
  const sa = JSON.parse(raw);
  if (sa.private_key && typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(sa),
    storageBucket: 'yaxselldemo.firebasestorage.app',
  });
  const db = getFirestore(app, DATABASE_ID);
  db.settings({ ignoreUndefinedProperties: true });
  return { app, db };
}

async function fetchAllAppwriteDocuments(collectionId) {
  const all = [];
  let offset = 0;
  const limit = 100;
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
    if (docs.length < limit) break;
    offset += limit;
  }
  return all;
}

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🚀 MIGRACIÓN DE LOGOS DE AGENCIAS: APPWRITE -> FIREBASE STORAGE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { app, db } = await getFirebaseDb();
  const bucket = getStorage(app).bucket();

  // 1. Leer agencias de Appwrite
  console.log('📡 Leyendo agencias desde Appwrite...');
  const awAgencies = await fetchAllAppwriteDocuments('shipping_agencies');
  console.log(`   ✓ ${awAgencies.length} agencias en Appwrite\n`);

  // 2. Leer agencias de Firebase
  console.log('📡 Leyendo agencias desde Firebase Firestore...');
  const fbSnap = await db.collection('shipping_agencies').get();
  const fbAgencies = fbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`   ✓ ${fbAgencies.length} agencias en Firebase\n`);

  // 3. Para cada agencia de Firebase, buscar su match en Appwrite por nombre
  let updated = 0;
  let skipped = 0;

  for (const fbAgency of fbAgencies) {
    const fbName = (fbAgency.name || '').trim().toUpperCase();
    const awMatch = awAgencies.find(aw => (aw.name || '').trim().toUpperCase() === fbName);

    if (!awMatch) {
      console.log(`  ⚠  "${fbAgency.name}" — no se encontró match en Appwrite, saltando`);
      skipped++;
      continue;
    }

    const awLogoUrl = awMatch.logo || awMatch.LOGO || '';
    if (!awLogoUrl) {
      console.log(`  ⚠  "${fbAgency.name}" — Appwrite no tiene logo, saltando`);
      skipped++;
      continue;
    }

    // Si el logo de Firebase ya es una URL de Firebase Storage, saltar
    if (fbAgency.logo && fbAgency.logo.includes('firebasestorage.app')) {
      console.log(`  ✓  "${fbAgency.name}" — ya tiene logo en Firebase Storage`);
      skipped++;
      continue;
    }

    try {
      console.log(`  📥 Descargando logo de "${fbAgency.name}" desde Appwrite...`);
      const logoBuffer = await downloadFile(awLogoUrl);

      // Determinar extensión
      const ext = awLogoUrl.match(/\.(png|jpg|jpeg|webp|gif|svg)/i)?.[1]?.toLowerCase() || 'png';
      const fileName = `agencias/${fbName.replace(/[^A-Za-z0-9]/g, '_')}.${ext}`;
      const file = bucket.file(fileName);

      console.log(`  📤 Subiendo a Firebase Storage: ${fileName}...`);
      await file.save(logoBuffer, {
        metadata: { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
        public: true,
      });

      const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2030' });
      console.log(`  🔗 URL: ${url.substring(0, 80)}...`);

      // Actualizar Firestore
      await db.collection('shipping_agencies').doc(fbAgency.id).update({ logo: url });
      console.log(`  ✓  "${fbAgency.name}" actualizado en Firestore\n`);
      updated++;
    } catch (e) {
      console.log(`  ✗  "${fbAgency.name}" — error: ${e.message}\n`);
      skipped++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`🎉 Migración de logos completada`);
  console.log(`   - Agencias actualizadas: ${updated}`);
  console.log(`   - Agencias saltadas: ${skipped}`);
  console.log(`   - Total agencias en Firebase: ${fbAgencies.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n✗ Error fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
