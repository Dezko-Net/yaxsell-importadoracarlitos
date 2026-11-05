const APPWRITE_KEY = 'standard_6cd1375a55fe6d93b6f0857404f29b5d3333dbf496213b6bea1afe3a0ead6c4489f9400f3cc3700c9f65573d5580239a5284aa99ea21f44cf07af1c96426aacc3ee9564048c035e0e5b26467316d9e56df117f52443748ff31cabfcaf1d336a0ef0519ede8e2924534aff4c7d98de556ba8ef52050cb6a349f8d4373faf46982';
const VENDOR_ID = '6a7f66541e7581429b18';
const headers = { 'X-Appwrite-Project': 'donbalatoivan', 'X-Appwrite-Key': APPWRITE_KEY };

const r = await fetch(`https://nyc.cloud.appwrite.io/v1/databases/6a62e7440033d2278d28/collections/products/documents?limit=500&queries=${encodeURIComponent(JSON.stringify([`equal("VENDOR_ID", "${VENDOR_ID}")`])}`, { headers });
const d = await r.json();
console.log('Top Lucky products in Appwrite:', d.total);
const cats = {};
for (const doc of d.documents) {
  const c = doc.CATEGORYID || doc.CATEGORY || '__none__';
  cats[c] = (cats[c] || 0) + 1;
}
console.log('Categories used:', JSON.stringify(cats, null, 2));
