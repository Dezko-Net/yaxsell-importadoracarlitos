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

async function testHomeQuery() {
  console.log("Simulating Home API Queries...");
  try {
    const [pRes, cheapRes] = await Promise.all([
      databases.listDocuments(DATABASE_ID, 'products', [
        Query.greaterThan('STOCK', 0),
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ]),
      databases.listDocuments(DATABASE_ID, 'products', [
        Query.greaterThan('STOCK', 0),
        Query.orderAsc('PRICE'),
        Query.limit(100)
      ])
    ]);

    const activeProducts = pRes.documents.filter(p => p.ISACTIVE !== false);
    const activeCheapestProducts = cheapRes.documents.filter(p => p.ISACTIVE !== false);

    console.log(`Successfully fetched ${pRes.documents.length} products. After active filter: ${activeProducts.length}`);
    console.log(`Successfully fetched ${cheapRes.documents.length} cheap products. After active filter: ${activeCheapestProducts.length}`);
    
    console.log("Cheapest 3 active products:");
    console.log(activeCheapestProducts.slice(0, 3).map(p => ({ NAME: p.NAME, PRICE: p.PRICE, ISACTIVE: p.ISACTIVE })));
  } catch (e) {
    console.error("Query failed:", e.message);
  }
}

testHomeQuery();
