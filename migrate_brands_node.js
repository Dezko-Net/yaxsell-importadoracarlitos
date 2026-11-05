const { Client, Databases, Query } = require('node-appwrite');

const projectId = '6a0a4e8d0032177f3f90';
const dbId = '6a0a58ca001798410d86';
const colId = 'products';
const key = 'standard_de757dd8d6cd1808ddc9a0b6694cad9a4e4ceb904a97613e4bc255cb116c0b1272ee9d865149911bab66ecb0e078d3120fbf9bd5c82cba8bc0d2ea6354cb3d24aa96e77f53d86fbf3a68a007abb0af608ee4854491b3e2b29b0d6e2fe63f907d592e8000c16c38f408e3bd1de65505897c249ecac5ecfb1e1a6de5c9b40aa655';

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject(projectId)
    .setKey(key);

const databases = new Databases(client);

async function migrate() {
    console.log('1. Creating BRAND attribute...');
    try {
        await databases.createStringAttribute(dbId, colId, 'BRAND', 255, false);
        console.log('Attribute created! Waiting 5 seconds for it to become available...');
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        if (e.code === 409) {
            console.log('Attribute BRAND already exists.');
        } else {
            console.error('Failed to create attribute:', e);
        }
    }

    console.log('2. Fetching products...');
    let allProducts = [];
    let offset = 0;
    let total = 1;
    while (allProducts.length < total) {
        const res = await databases.listDocuments(dbId, colId, [
            Query.limit(100),
            Query.offset(offset)
        ]);
        allProducts.push(...res.documents);
        total = res.total;
        offset += 100;
    }
    console.log(`Fetched ${allProducts.length} products.`);

    console.log('3. Updating products...');
    let updatedCount = 0;
    for (const p of allProducts) {
        if (!p.NAME) continue;
        const name = p.NAME.toLowerCase();
        let brand = '';
        if (name.includes('sadoer')) brand = 'Sadoer';
        else if (name.includes('kevin&coco') || name.includes('kevin & coco') || name.includes('kevincoco') || name.includes('kevin coco')) brand = 'Kevin&Coco';
        else if (name.includes('karite') || name.includes('karité')) brand = 'Karite';
        else if (name.includes('kiss beauty')) brand = 'Kiss Beauty';
        else if (name.includes('ushas')) brand = 'Ushas';
        else if (name.includes('ruby rose')) brand = 'Ruby Rose';
        else if (name.includes('pink 21') || name.includes('pink21')) brand = 'Pink 21';
        else if (name.includes('hengfang')) brand = 'HengFang';
        else if (name.includes('peiliee')) brand = 'Peiliee';
        else if (name.includes('huda')) brand = 'Huda Beauty';

        if (p.BRAND !== brand) {
            try {
                await databases.updateDocument(dbId, colId, p.$id, { BRAND: brand });
                updatedCount++;
            } catch (err) {
                console.error(`Failed to update ${p.$id}:`, err.message);
            }
        }
    }
    console.log(`Updated ${updatedCount} products.`);
}

migrate();
