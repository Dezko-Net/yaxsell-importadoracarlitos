import { Client, Databases } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('698f6de50012f9df7ebd')
  .setKey('standard_a4a8dd2d5c0e8e0e5c5b5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e');

const databases = new Databases(client);

try {
  const collection = await databases.getCollection('67f1dc940037b3d367bb', 'timed_offers');
  console.log('timed_offers attributes:');
  collection.attributes.forEach(attr => {
    console.log(`- ${attr.key} (${attr.type})`);
  });
} catch (e) {
  console.error('Error:', e.message);
}
