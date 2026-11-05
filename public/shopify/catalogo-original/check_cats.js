const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'donbalatoivanchile'
});
const db = admin.firestore();

async function check() {
  const doc = await db.doc('donbalatoivan_config/categories').get();
  console.log(JSON.stringify(doc.data(), null, 2));
}

check().catch(console.error);
