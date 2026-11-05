const { Client, Databases, Permission, Role } = require('node-appwrite');

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('698f6de50012f9df7ebd')
    .setKey('standard_ea10b9d7d4414fec61778bdc7f569b0de82bb3aca157f5949bbb8c7320b379f12e15649cae18dc0512f75fd8d575dd5f59058125598e0a0491fa9ea9760ff67b2f792df372b838bf5bd1a9acfef29f201ccb20105285ee2787343eebf89234a4b0a6977ae7447cc5d9c0742d0f9d364d03730c97261748a019bf592ce7cd2025');

const databases = new Databases(client);
const databaseId = '67f1dc940037b3d367bb';
const collectionId = 'discount_coupons';

async function updateCouponsSchema() {
    try {
        console.log('Adding new attributes for LoyaltyService compatibility...');
        const createAttr = async (fn, ...args) => {
            try { await fn(...args); console.log(`Created ${args[2]}`); } 
            catch(e) { if(e.code !== 409) console.error(`Error ${args[2]}:`, e.message); else console.log(`${args[2]} already exists`); }
        };

        // LoyaltyService attributes
        await createAttr(databases.createStringAttribute.bind(databases), databaseId, collectionId, 'DISCOUNTTYPE', 20, false);
        await createAttr(databases.createFloatAttribute.bind(databases), databaseId, collectionId, 'DISCOUNTVALUE', false);
        await createAttr(databases.createFloatAttribute.bind(databases), databaseId, collectionId, 'MINORDERVALUE', false);
        await createAttr(databases.createIntegerAttribute.bind(databases), databaseId, collectionId, 'MAXUSES', false);
        await createAttr(databases.createIntegerAttribute.bind(databases), databaseId, collectionId, 'USES', false);
        await createAttr(databases.createBooleanAttribute.bind(databases), databaseId, collectionId, 'ISACTIVE', false);
        await createAttr(databases.createStringAttribute.bind(databases), databaseId, collectionId, 'EXPIRESAT', 50, false);
        await createAttr(databases.createIntegerAttribute.bind(databases), databaseId, collectionId, 'CREATEDAT', false);
        await createAttr(databases.createStringAttribute.bind(databases), databaseId, collectionId, 'USERRESTRICTION', 100, false);
        await createAttr(databases.createStringAttribute.bind(databases), databaseId, collectionId, 'DESCRIPTION', 255, false);

        console.log('Schema update initiated.');
    } catch (err) {
        console.error('Error setting up collection:', err);
    }
}

updateCouponsSchema();
