const { Client, Databases, Query } = require('appwrite');
const c = new Client().setEndpoint('https://nyc.cloud.appwrite.io/v1').setProject('donbalatoivan');
const db = new Databases(c);
db.listDocuments('6a62e7440033d2278d28', 'products', [Query.equal('NAME', 'Producto de prueba'), Query.limit(3)])
  .then(r => {
    r.documents.forEach(d => {
      console.log(JSON.stringify({ id: d.$id, name: d.NAME, VENDOR_ID: d.VENDOR_ID, STOCK: d.STOCK, ISACTIVE: d.ISACTIVE }, null, 2));
    });
  })
  .catch(e => console.error(e.message));
