const { Client, Databases } = require('node-appwrite');

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('6a0a4e8d0032177f3f90')
    .setKey('standard_de757dd8d6cd1808ddc9a0b6694cad9a4e4ceb904a97613e4bc255cb116c0b1272ee9d865149911bab66ecb0e078d3120fbf9bd5c82cba8bc0d2ea6354cb3d24aa96e77f53d86fbf3a68a007abb0af608ee4854491b3e2b29b0d6e2fe63f907d592e8000c16c38f408e3bd1de65505897c249ecac5ecfb1e1a6de5c9b40aa655');

const databases = new Databases(client);
const databaseId = '6a0a58ca001798410d86';
const collectionId = 'orders';

async function check() {
    try {
        const attrs = await databases.listAttributes(databaseId, collectionId);
        console.log(attrs.attributes.map(a => `${a.key} (${a.type}) - Required: ${a.required}`).join('\n'));
    } catch (e) { console.error(e); }
}
check();
