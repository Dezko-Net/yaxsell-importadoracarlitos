import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: 'asistoraerp',
  storageBucket: 'asistoraerp.firebasestorage.app',
});
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('products').get();
  console.log(`Total productos: ${snap.size}\n`);
  
  let withAppwrite = 0;
  let withFirebase = 0;
  let withEmpty = 0;
  let withOther = 0;
  const appwriteUrls = new Set();
  
  for (const doc of snap.docs) {
    const data = doc.data();
    const urls = [data.IMAGEURL, data.IMAGEURL2, data.IMAGEURL3].filter(Boolean);
    
    if (urls.length === 0) {
      withEmpty++;
      continue;
    }
    
    for (const url of urls) {
      if (url.includes('appwrite.io')) {
        withAppwrite++;
        appwriteUrls.add(url);
      } else if (url.includes('asistoraerp') || url.includes('firebasestorage')) {
        withFirebase++;
      } else if (url) {
        withOther++;
        console.log(`  OTRO: ${url.slice(0, 100)}`);
      }
    }
  }
  
  console.log(`URLs de Appwrite: ${withAppwrite}`);
  console.log(`URLs de Firebase: ${withFirebase}`);
  console.log(`URLs vacías: ${withEmpty}`);
  console.log(`URLs otras: ${withOther}`);
  console.log(`URLs únicas de Appwrite: ${appwriteUrls.size}`);
  
  // Mostrar algunas URLs de ejemplo
  console.log('\n=== Primeras 5 URLs de Appwrite ===');
  let i = 0;
  for (const url of appwriteUrls) {
    if (i++ >= 5) break;
    console.log(`  ${url}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
