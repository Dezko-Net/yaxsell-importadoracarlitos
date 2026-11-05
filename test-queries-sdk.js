const { Client, Databases, Query } = require('node-appwrite');

const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const PROJECT_ID = '6a0a4e8d0032177f3f90';
const DATABASE_ID = '6a0a58ca001798410d86';
const API_KEY = 'standard_c476eaadc21bbecc3b6949ee4d0a932613b7a3d4ee52c80cf2c1406750ff75267becfad617da0acd444d0b903b8faea19661d48b2f8b6dc09b678e0db164ddd4b472417c3477a091188554bdd2adfad944778a2927090744ae991c9dcf48c7cebc60e437f5c8a841ffb0736da27daf197bf5716065c2ea5dda65070b07d74642';

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

async function testSDK() {
  console.log("Starting SDK query tests...");
  
  // Test 4: Query products with orderDesc('$createdAt')
  try {
    const res4 = await databases.listDocuments(DATABASE_ID, 'products', [
      Query.greaterThan('STOCK', 0),
      Query.orderDesc('$createdAt'),
      Query.limit(80)
    ]);
    console.log("Products count (ordered by $createdAt desc):", res4.documents.length);
    if (res4.documents.length > 0) {
      console.log("Sample:", res4.documents.slice(0, 3).map(p => ({ name: p.NAME, created: p.$createdAt, stock: p.STOCK, active: p.ISACTIVE })));
    }
  } catch (e) {
    console.error("Test 4 error:", e.message);
  }

  // Test 5: Query orders in negotiation
  try {
    const res5 = await databases.listDocuments(DATABASE_ID, 'orders', [
      Query.equal('STATUS', 'negotiation')
    ]);
    console.log(`Orders in negotiation: ${res5.total}`);
    for(const doc of res5.documents) {
      console.log(`Order ${doc.ORDERCODE} - AdditionalInfo: ${doc.ADDITIONALINFO}`);
    }
  } catch (e) {
    console.error("Test 5 error:", e.message);
  }
}

testSDK();
