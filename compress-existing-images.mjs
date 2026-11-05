import { initializeApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const bucket = getStorage(app).bucket();
const db = getFirestore(app);

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const QUALITY = 82;

async function main() {
  const [files] = await bucket.getFiles({ prefix: 'yaxsell/' });
  
  console.log(`Encontradas ${files.length} imágenes en Firebase Storage\n`);
  
  let compressed = 0;
  let skipped = 0;
  let errors = 0;
  let totalSaved = 0;
  const urlUpdates = [];

  for (const file of files) {
    const fileName = file.name;
    
    try {
      // Download original
      const [originalBuffer] = await file.download();
      const originalSize = originalBuffer.length;
      
      // Check if already small enough
      if (originalSize < 30 * 1024) {
        console.log(`  ⏭️  Skip (ya pequeña ${Math.round(originalSize/1024)}KB): ${fileName}`);
        skipped++;
        continue;
      }

      // Detect format from content
      const metadata = await sharp(originalBuffer).metadata();
      const format = metadata.format || 'jpeg';
      
      // Compress to WebP
      const compressedBuffer = await sharp(originalBuffer)
        .resize(MAX_WIDTH, MAX_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: QUALITY })
        .toBuffer();

      const compressedSize = compressedBuffer.length;
      const savings = Math.round((1 - compressedSize / originalSize) * 100);
      
      if (savings < 10) {
        console.log(`  ⏭️  Skip (solo ${savings}% ahorro): ${fileName}`);
        skipped++;
        continue;
      }

      // New filename with .webp extension
      const newFileName = `${fileName}.webp`;
      
      // Upload new compressed file
      const newFile = bucket.file(newFileName);
      await newFile.save(compressedBuffer, {
        metadata: { contentType: 'image/webp' },
      });

      // Delete original
      await file.delete();

      totalSaved += (originalSize - compressedSize);
      console.log(`  ✅ ${fileName}: ${Math.round(originalSize/1024)}KB → ${Math.round(compressedSize/1024)}KB (${savings}% ahorro) [${format}→webp]`);
      compressed++;
      
      // Track URL update
      const oldUrl = `https://storage.googleapis.com/asistoraerp.firebasestorage.app/${encodeURIComponent(fileName).replace(/%2F/g, '/')}`;
      const newUrl = `https://storage.googleapis.com/asistoraerp.firebasestorage.app/${encodeURIComponent(newFileName).replace(/%2F/g, '/')}`;
      urlUpdates.push({ oldUrl, newUrl, oldName: fileName, newName: newFileName });
      
    } catch (e) {
      console.error(`  ❌ Error: ${fileName}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Comprimidas: ${compressed}`);
  console.log(`Saltadas: ${skipped}`);
  console.log(`Errores: ${errors}`);
  console.log(`Espacio ahorrado: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
  
  // Update Firestore documents
  if (urlUpdates.length > 0) {
    console.log(`\n=== ACTUALIZANDO FIRESTORE ===`);
    
    const productsSnap = await db.collection('products').get();
    let updatedDocs = 0;
    
    for (const doc of productsSnap.docs) {
      const data = doc.data();
      const updates = {};
      let changed = false;
      
      for (const field of ['IMAGEURL', 'IMAGEURL2', 'IMAGEURL3', 'IMAGEURL4', 'IMAGEURL5']) {
        const currentUrl = data[field];
        if (!currentUrl) continue;
        
        for (const { oldUrl, newUrl, oldName, newName } of urlUpdates) {
          // Match by file name in URL (more flexible than exact URL match)
          if (currentUrl.includes(oldName) && !currentUrl.includes('.webp')) {
            updates[field] = currentUrl.replace(oldName, newName);
            changed = true;
            break;
          }
        }
      }
      
      if (changed) {
        await doc.ref.update(updates);
        console.log(`  📝 Producto ${doc.id}: ${JSON.stringify(Object.keys(updates))}`);
        updatedDocs++;
      }
    }
    
    console.log(`\nDocumentos actualizados: ${updatedDocs}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
