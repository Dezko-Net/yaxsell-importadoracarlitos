import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Inicializar Firebase Admin
const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const STORAGE_FOLDER = 'yaxsell/Donbalato Ivan';

// Mapeo de URLs de Appwrite → nueva URL de Firebase
const urlMap = new Map();

async function downloadAndUpload(appwriteUrl, fileId) {
  // Si ya migré esta URL, retornar la URL existente
  if (urlMap.has(appwriteUrl)) {
    return urlMap.get(appwriteUrl);
  }

  const destPath = `${STORAGE_FOLDER}/${fileId}`;
  
  try {
    // 1. Descargar imagen desde Appwrite
    const res = await fetch(appwriteUrl);
    if (!res.ok) {
      console.error(`  ERROR descargando ${fileId}: HTTP ${res.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    
    // 2. Subir a Firebase Storage
    const file = bucket.file(destPath);
    await file.save(buffer, {
      metadata: {
        contentType,
        cacheControl: 'public,max-age=31536000', // 1 año de cache
      },
    });
    
    // 3. Hacer pública
    await file.makePublic();
    
    // 4. Construir URL pública
    const publicUrl = `https://storage.googleapis.com/asistoraerp.firebasestorage.app/${encodeURIComponent(STORAGE_FOLDER).replace(/%2F/g, '/')}/${fileId}`;
    
    urlMap.set(appwriteUrl, publicUrl);
    console.log(`  OK: ${fileId} → ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`  ERROR subiendo ${fileId}: ${err.message}`);
    return null;
  }
}

function extractFileId(url) {
  // URL: https://nyc.cloud.appwrite.io/v1/storage/buckets/media/files/6a630da50007e6a965bf/view?project=donbalatoivan
  const match = url.match(/\/files\/([^\/]+)\/view/);
  return match ? match[1] : null;
}

async function main() {
  console.log('=== MIGRACIÓN DE IMÁGENES APPWRITE → FIREBASE STORAGE ===\n');
  console.log(`Carpeta destino: ${STORAGE_FOLDER}/\n`);
  
  const snap = await db.collection('products').get();
  console.log(`Total productos: ${snap.size}\n`);
  
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  const updates = [];
  
  for (const doc of snap.docs) {
    const data = doc.data();
    const fields = ['IMAGEURL', 'IMAGEURL2', 'IMAGEURL3'];
    const updates_needed = {};
    let needsUpdate = false;
    
    for (const field of fields) {
      const url = data[field];
      if (!url || !url.includes('appwrite.io')) {
        continue;
      }
      
      const fileId = extractFileId(url);
      if (!fileId) {
        console.error(`  No se pudo extraer fileId de: ${url}`);
        failed++;
        continue;
      }
      
      const newUrl = await downloadAndUpload(url, fileId);
      if (newUrl) {
        updates_needed[field] = newUrl;
        needsUpdate = true;
        migrated++;
      } else {
        failed++;
      }
    }
    
    if (needsUpdate) {
      updates.push({ docId: doc.id, updates: updates_needed });
    } else {
      skipped++;
    }
  }
  
  console.log(`\n=== RESUMEN ===`);
  console.log(`Imágenes migradas: ${migrated}`);
  console.log(`Fallos: ${failed}`);
  console.log(`Productos sin cambios: ${skipped}`);
  console.log(`Productos a actualizar: ${updates.length}`);
  
  // Guardar el mapeo para usarlo después
  writeFileSync('image-migration-map.json', JSON.stringify({ updates, urlMap: Array.from(urlMap.entries()) }, null, 2));
  console.log(`\nMapeo guardado en image-migration-map.json`);
  
  // Actualizar los documentos en Firestore
  console.log(`\nActualizando ${updates.length} productos en Firestore...`);
  let updated = 0;
  for (const u of updates) {
    try {
      await db.collection('products').doc(u.docId).update(u.updates);
      updated++;
    } catch (err) {
      console.error(`  ERROR actualizando ${u.docId}: ${err.message}`);
    }
  }
  console.log(`Productos actualizados: ${updated}/${updates.length}`);
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
