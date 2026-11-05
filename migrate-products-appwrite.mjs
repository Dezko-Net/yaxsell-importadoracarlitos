// Migra products desde Appwrite (donbalatoivan) → Firebase (asistoraerp)
import { Client, Databases, Query } from 'appwrite';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch } from 'firebase/firestore';

// Appwrite source
const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('donbalatoivan');
const databases = new Databases(client);
const DB_ID = '6a62e7440033d2278d28';
const PRODUCTS_COL = 'products';

// Firebase target
const firebaseConfig = {
  apiKey: "AIzaSyCEcbWJSiDKXnAanhVb_hQ79fLbqeXpYYs",
  authDomain: "asistoraerp.firebaseapp.com",
  projectId: "asistoraerp",
  storageBucket: "asistoraerp.firebasestorage.app",
  messagingSenderId: "386824737987",
  appId: "1:386824737987:web:f85ebb6bae11190da3be76",
};
const fbApp = initializeApp(firebaseConfig);
const fbDb = getFirestore(fbApp);

async function main() {
  console.log('Leyendo productos desde Appwrite (donbalatoivan)...');
  
  // First, get a sample to see the schema
  const sample = await databases.listDocuments(DB_ID, PRODUCTS_COL, [Query.limit(2)]);
  if (sample.documents.length > 0) {
    console.log('\n=== SAMPLE PRODUCT FROM APPWRITE ===');
    const keys = Object.keys(sample.documents[0]).sort();
    console.log('Fields:', keys.join(', '));
    const sampleData = {};
    for (const k of keys.slice(0, 15)) sampleData[k] = sample.documents[0][k];
    console.log('Sample:', JSON.stringify(sampleData, null, 2).substring(0, 800));
  }
  
  console.log(`\nTotal products in Appwrite: ${sample.total}`);
  console.log('\nStarting migration...');
  
  let allDocs = [];
  let cursor = null;
  let offset = 0;
  
  // Fetch all products in batches of 100
  while (true) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    
    const res = await databases.listDocuments(DB_ID, PRODUCTS_COL, queries);
    if (res.documents.length === 0) break;
    
    allDocs.push(...res.documents);
    cursor = res.documents[res.documents.length - 1].$id;
    offset += res.documents.length;
    
    console.log(`  Fetched ${offset}/${sample.total}...`);
    if (res.documents.length < 100) break;
  }
  
  console.log(`\nTotal fetched: ${allDocs.length}`);
  
  // Write to Firebase in batches
  console.log('Writing to Firebase (asistoraerp)...');
  let migrated = 0;
  const batchSize = 400;
  
  for (let i = 0; i < allDocs.length; i += batchSize) {
    const batch = writeBatch(fbDb);
    const chunk = allDocs.slice(i, i + batchSize);
    
    for (const d of chunk) {
      // Clean the document — remove Appwrite internals, keep $id for doc ID
      const cleanData = JSON.parse(JSON.stringify(d));
      const docId = cleanData.$id;
      delete cleanData.$id;
      delete cleanData.$createdAt;
      delete cleanData.$updatedAt;
      delete cleanData.$permissions;
      delete cleanData.$databaseId;
      delete cleanData.$collectionId;
      
      // Add storeId if not present
      if (!cleanData.storeId) cleanData.storeId = 'main_store';
      
      batch.set(doc(fbDb, 'products', docId), cleanData);
    }
    
    await batch.commit();
    migrated += chunk.length;
    console.log(`  Written ${migrated}/${allDocs.length}...`);
  }
  
  console.log(`\n✓ Migración completa: ${migrated} productos migrados a Firebase asistoraerp`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
