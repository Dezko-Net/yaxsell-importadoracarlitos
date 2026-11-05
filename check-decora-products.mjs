const APPWRITE_KEY = 'standard_6cd1375a55fe6d93b6f0857404f29b5d3333dbf496213b6bea1afe3a0ead6c4489f9400f3cc3700c9f65573d5580239a5284aa99ea21f44cf07af1c96426aacc3ee9564048c035e0e5b26467316d9e56df117f52443748ff31cabfcaf1d336a0ef0519ede8e2924534aff4c7d98de556ba8ef52050cb6a349f8d4373faf46982';
const headers = { 'X-Appwrite-Project': 'donbalatoivan', 'X-Appwrite-Key': APPWRITE_KEY };
const r = await fetch('https://nyc.cloud.appwrite.io/v1/databases/6a62e7440033d2278d28/collections/products/documents?limit=500', { headers });
const d = await r.json();
console.log('total products:', d.total);
const decor = (d.documents || []).filter(doc => (doc.CATEGORYID || doc.CATEGORY) === '6a7f7545003c87cd0965');
console.log('Productos con Decora Textil:', decor.length);
for (const doc of decor) {
  console.log(doc.$id, '|', doc.NAME, '| VENDOR_ID:', doc.VENDOR_ID || '__MAIN__');
}
