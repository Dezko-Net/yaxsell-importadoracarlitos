import { initializeApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const bucket = getStorage(app).bucket();

async function main() {
  const [files] = await bucket.getFiles({ prefix: 'yaxsell/' });
  let totalSize = 0;
  let count = 0;
  const sizes = [];
  
  for (const file of files) {
    const [meta] = await file.getMetadata();
    const size = Number(meta.size) || 0;
    totalSize += size;
    count++;
    sizes.push({ name: file.name, size });
  }
  
  sizes.sort((a, b) => b.size - a.size);
  
  console.log(`Total archivos: ${count}`);
  console.log(`Tamaño total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nTop 20 imágenes más grandes:`);
  for (const s of sizes.slice(0, 20)) {
    console.log(`  ${(s.size / 1024).toFixed(0)} KB - ${s.name}`);
  }
  
  // Promedio
  if (count > 0) {
    console.log(`\nTamaño promedio: ${(totalSize / count / 1024).toFixed(0)} KB`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
