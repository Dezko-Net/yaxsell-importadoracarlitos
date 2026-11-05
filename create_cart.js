const appwrite = require('appwrite');
const c = new appwrite.Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('6a0a4e8d0032177f3f90');
const db = new appwrite.Databases(c);

async function run() {
  try {
    await db.createCollection('6a0a58ca001798410d86', 'cart_snapshots', 'Cart Snapshots');
    await db.createStringAttribute('6a0a58ca001798410d86', 'cart_snapshots', 'userId', 255, true);
    await db.createStringAttribute('6a0a58ca001798410d86', 'cart_snapshots', 'cartData', 100000, true);
    console.log('Collection created successfully');
  } catch(e) {
    console.log(e.message);
  }
}
run();
