const { Client, Databases, Query } = require('appwrite');
const c = new Client().setEndpoint('https://nyc.cloud.appwrite.io/v1').setProject('donbalatoivan');
const db = new Databases(c);
db.listDocuments('6a62e7440033d2278d28', 'products', [Query.limit(10)])
  .then(r => {
    r.documents.forEach(d => {
      console.log(`${d.NAME} | VENDOR_ID=${d.VENDOR_ID || '(sin vendor)'}`);
    });
  })
  .catch(e => console.error(e.message));
