// Script para detectar productos con imágenes rotas
// Ejecutar: node check_broken_images.js

const { Client, Databases } = require('appwrite');

const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('6a0a4e8d0032177f3f90');

const databases = new Databases(client);
const databaseId = '6a0a58ca001798410d86';
const productsCollection = 'products';
const inventoryCollection = 'inventory_products';
const catalogCollection = 'catalog_products';

async function checkImage(url) {
  try {
    if (!url || url.trim() === '') return { status: 'empty', code: 0 };
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(url, { 
      method: 'HEAD', 
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeout);
    return { status: res.ok ? 'ok' : 'error', code: res.status };
  } catch (err) {
    // Si HEAD falla, intentar GET
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(url, { 
        method: 'GET', 
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeout);
      return { status: res.ok ? 'ok' : 'error', code: res.status };
    } catch (err2) {
      return { status: 'timeout', code: 0 };
    }
  }
}

async function main() {
  const collections = [
    { name: 'products', id: productsCollection },
    { name: 'inventory_products', id: inventoryCollection },
    { name: 'catalog_products', id: catalogCollection },
  ];
  
  for (const col of collections) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Revisando colección: ${col.name}`);
      console.log(`${'='.repeat(50)}\n`);
      
      let allProducts = [];
      let offset = 0;
      const limit = 100;
      
      while (true) {
        const res = await databases.listDocuments(databaseId, col.id, []);
        const docs = res.documents;
        allProducts = allProducts.concat(docs);
        if (docs.length < limit) break;
        offset += limit;
      }
      
      console.log(`Total productos: ${allProducts.length}\n`);
      
      if (allProducts.length === 0) {
        console.log('No hay productos en esta colección.\n');
        continue;
      }
      
      const broken = [];
      const noImage = [];
      let okCount = 0;
      
      for (let i = 0; i < allProducts.length; i += 10) {
        const batch = allProducts.slice(i, i + 10);
        const results = await Promise.all(batch.map(async (p) => {
          const url = p.IMAGEURL || '';
          const check = await checkImage(url);
          return { product: p, url, check };
        }));
        
        for (const r of results) {
          if (r.check.status === 'empty') {
            noImage.push({ id: r.product.$id, name: r.product.NAME, sku: r.product.SKU });
          } else if (r.check.status === 'ok') {
            okCount++;
          } else {
            broken.push({ 
              id: r.product.$id, 
              name: r.product.NAME, 
              sku: r.product.SKU, 
              url: r.url, 
              status: r.check.status, 
              code: r.check.code 
            });
          }
        }
        
        process.stdout.write(`\rRevisados: ${Math.min(i + 10, allProducts.length)}/${allProducts.length}`);
      }
      
      console.log('\n');
      console.log(`✅ Imágenes OK: ${okCount}`);
      console.log(`❌ Imágenes rotas: ${broken.length}`);
      console.log(`⚠️  Sin imagen: ${noImage.length}\n`);
      
      if (broken.length > 0) {
        console.log('--- PRODUCTOS CON IMAGEN ROTA ---');
        for (const b of broken) {
          console.log(`\nID: ${b.id}`);
          console.log(`Nombre: ${b.name}`);
          console.log(`SKU: ${b.sku || 'N/A'}`);
          console.log(`URL: ${b.url}`);
          console.log(`Status: ${b.status} (${b.code})`);
        }
      }
      
      if (noImage.length > 0) {
        console.log('\n--- PRODUCTOS SIN IMAGEN ---');
        for (const n of noImage) {
          console.log(`ID: ${n.id} | Nombre: ${n.name} | SKU: ${n.sku || 'N/A'}`);
        }
      }
      
      if (broken.length === 0 && noImage.length === 0) {
        console.log('✅ Todas las imágenes están funcionando correctamente!');
      }
      
    } catch (error) {
      console.error(`❌ Error en ${col.name}:`, error.message);
    }
  }
}

main();
