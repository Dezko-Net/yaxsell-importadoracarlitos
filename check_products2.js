const appwrite = require('appwrite');
const c = new appwrite.Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('6a0a4e8d0032177f3f90');
const db = new appwrite.Databases(c);

async function run() {
  try {
    let all = [];
    let offset = 0;
    while(true) {
      const r = await db.listDocuments('6a0a58ca001798410d86', 'products', [
        appwrite.Query.equal('ISACTIVE', true),
        appwrite.Query.limit(100),
        appwrite.Query.offset(offset)
      ]);
      all.push(...r.documents);
      if (r.documents.length < 100) break;
      offset += 100;
    }
    console.log('Total ISACTIVE=true:', all.length);
    let zeroStock = all.filter(p => !p.STOCK || p.STOCK <= 0);
    console.log('Zero stock:', zeroStock.length);
    console.log('Sample of zero stock:', zeroStock.slice(0,3).map(p => ({ SKU: p.sku || p.SKU, IMAGEURL: !!p.IMAGEURL })));
  } catch(e) {
    console.error(e);
  }
}
run();
