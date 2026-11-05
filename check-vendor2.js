const { Client, Databases, Query } = require('appwrite');
const c = new Client().setEndpoint('https://nyc.cloud.appwrite.io/v1').setProject('donbalatoivan');
const db = new Databases(c);
db.listDocuments('6a62e7440033d2278d28', 'vendors', [Query.equal('$id', '6a79d8880a5647fca27a'), Query.limit(1)])
  .then(r => {
    r.documents.forEach(d => {
      console.log(JSON.stringify({ id: d.$id, NAME: d.NAME, EMAIL: d.EMAIL, ACTIVE: d.ACTIVE }, null, 2));
    });
    if (r.documents.length === 0) console.log('NO SE ENCONTRÓ EL VENDOR');
  })
  .catch(e => console.error(e.message));
