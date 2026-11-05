const { Client, Databases, Permission, Role } = require('node-appwrite');

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('698f6de50012f9df7ebd')
    .setKey('standard_ea10b9d7d4414fec61778bdc7f569b0de82bb3aca157f5949bbb8c7320b379f12e15649cae18dc0512f75fd8d575dd5f59058125598e0a0491fa9ea9760ff67b2f792df372b838bf5bd1a9acfef29f201ccb20105285ee2787343eebf89234a4b0a6977ae7447cc5d9c0742d0f9d364d03730c97261748a019bf592ce7cd2025');

const databases = new Databases(client);
const databaseId = '67f1dc940037b3d367bb';
const collectionId = 'discount_coupons';

async function setupCouponsCollection() {
    try {
        console.log(`Checking if collection ${collectionId} exists...`);
        try {
            await databases.getCollection(databaseId, collectionId);
            console.log('Collection already exists.');
        } catch (e) {
            if (e.code === 404) {
                console.log('Creating collection...');
                await databases.createCollection(
                    databaseId, 
                    collectionId, 
                    'Discount Coupons', 
                    [
                        Permission.read(Role.any()),
                        Permission.create(Role.users()),
                        Permission.update(Role.users()),
                        Permission.delete(Role.users()),
                    ]
                );
                console.log('Collection created. Adding attributes...');
                
                await databases.createStringAttribute(databaseId, collectionId, 'CODE', 50, true);
                await databases.createStringAttribute(databaseId, collectionId, 'TYPE', 20, true, 'percent'); // 'percent' or 'fixed'
                await databases.createFloatAttribute(databaseId, collectionId, 'VALUE', true);
                await databases.createFloatAttribute(databaseId, collectionId, 'MINORDERAMOUNT', false);
                await databases.createFloatAttribute(databaseId, collectionId, 'MAXDISCOUNT', false);
                await databases.createBooleanAttribute(databaseId, collectionId, 'ACTIVE', true, true);
                await databases.createIntegerAttribute(databaseId, collectionId, 'USEDCOUNT', false, 0, 99999, 0);
                await databases.createIntegerAttribute(databaseId, collectionId, 'STARTAT', false);
                await databases.createIntegerAttribute(databaseId, collectionId, 'ENDAT', false);

                console.log('Attributes creation initiated. They might take a moment to be fully available.');
            } else {
                throw e;
            }
        }
    } catch (err) {
        console.error('Error setting up collection:', err);
    }
}

setupCouponsCollection();
