const appwrite = require('appwrite');
const c = new appwrite.Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('6a0a4e8d0032177f3f90');
const db = new appwrite.Databases(c);

async function run() {
  try {
    const r = await db.listDocuments('6a0a58ca001798410d86', 'products', [
      appwrite.Query.equal('ISACTIVE', true),
      appwrite.Query.limit(50)
    ]);
    console.log('Active products:', r.total);
    r.documents.forEach(d => {
      console.log(`SKU: ${d.sku || d.SKU} | STOCK: ${d.STOCK} | NAME: ${d.NAME}`);
    });
  } catch(e) {
    console.error(e);
  }
}
run();
