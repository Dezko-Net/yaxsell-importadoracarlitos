const XLSX = require('xlsx');
const https = require('https');
const http = require('http');

const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const PROJECT_ID = '698f6de50012f9df7ebd';
const DATABASE_ID = '67f1dc940037b3d367bb';
const GEMINI_KEY = 'AIzaSyDg0RP4L104VRekl6hGWqagi3B1lAG3xlw';

// ── HTTP helper ──────────────────────────────────────────────
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function appwriteGet(path) {
  return fetchJson(`${APPWRITE_ENDPOINT}${path}`, {
    headers: {
      'X-Appwrite-Project': PROJECT_ID,
      'Content-Type': 'application/json',
    },
  });
}

async function fetchAllDocs(collectionId) {
  let docs = [];
  let offset = 0;
  while (true) {
    const data = await appwriteGet(
      `/databases/${DATABASE_ID}/collections/${collectionId}/documents?queries[]=limit(100)&queries[]=offset(${offset})`
    );
    docs = docs.concat(data.documents || []);
    if (docs.length >= (data.total || 0) || (data.documents || []).length === 0) break;
    offset += 100;
  }
  return docs;
}

// ── Gemini batch translate ────────────────────────────────────
async function translateBatch(items, existingCategories) {
  const catList = existingCategories.length
    ? existingCategories.map(c => c.name).join(', ')
    : 'Cuidado de la Piel, Maquillaje, Cuidado Capilar, Perfumería, Uñas, Accesorios de Belleza, Higiene Personal, Hogar';

  const lines = items.map(i => `SKU:${i.sku}|CN:${i.nameCn}|CAT_CN:${i.categoryRaw}`).join('\n');

  const prompt = `Eres experto en cosméticos y belleza para el mercado latinoamericano.

CATEGORÍAS YA EXISTENTES EN LA TIENDA: ${catList}

Para cada línea devuelve EXACTAMENTE:
SKU:xxx|NOMBRE_ES:traducción|CATEGORIA:categoría|SUBCATEGORIA:subcategoría

REGLAS:
- Traduce CN al español. Mantén marcas como SADOER, BIOAQUA, LAIKOU, etc.
- Si CN ya está en español, mantenlo tal cual o mejora levemente
- CATEGORIA: usa una existente si aplica, si no crea una nueva descriptiva en español
- SUBCATEGORIA: subcategoría específica en español (puede ser nueva)
- Devuelve EXACTAMENTE una línea por producto, sin texto extra

PRODUCTOS:
${lines}`;

  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });

  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      body,
    }
  );

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const result = {};
  for (const line of text.split('\n')) {
    const m = line.match(/SKU:([^|]+)\|NOMBRE_ES:([^|]+)\|CATEGORIA:([^|]+)\|SUBCATEGORIA:(.+)/);
    if (m) {
      result[m[1].trim()] = {
        nameEs: m[2].trim(),
        category: m[3].trim(),
        subcategory: m[4].trim(),
      };
    }
  }
  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('=== TRADUCCIÓN DE PRODUCTOS QIANJI ===\n');

  // 1. Fetch categories from Appwrite
  console.log('1. Cargando categorías de Appwrite...');
  let existingCategories = [];
  try {
    const cats = await fetchAllDocs('categories');
    existingCategories = cats.map(c => ({ id: c.$id, name: c.NAME || c.name || '' })).filter(c => c.name);
    console.log(`   ${existingCategories.length} categorías: ${existingCategories.map(c => c.name).join(', ')}`);
  } catch (e) {
    console.warn('   No se pudieron cargar categorías:', e.message);
  }

  // 2. Load Excel
  console.log('\n2. Cargando Excel...');
  const wb = XLSX.readFile('C:/Proyectos/PROJECT YAXSEL/excels/productos_con_stock.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const products = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`   ${products.length} productos`);

  // 3. Translate in batches
  const BATCH = 200;
  const translations = {};
  const totalBatches = Math.ceil(products.length / BATCH);
  console.log(`\n3. Traduciendo en ${totalBatches} lotes de ${BATCH}...`);

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    process.stdout.write(`   Lote ${batchNum}/${totalBatches} ... `);

    const items = batch.map(r => ({
      sku: String(r['Codigo'] || '').trim(),
      nameCn: String(r['Nombre del producto 1'] || '').trim(),
      categoryRaw: String(r['Categoria'] || '').trim(),
    }));

    let retries = 0;
    while (retries < 3) {
      try {
        const result = await translateBatch(items, existingCategories);
        Object.assign(translations, result);
        console.log(`✓ ${Object.keys(result).length}/${batch.length}`);

        // Add new categories to context for next batches
        for (const t of Object.values(result)) {
          if (t.category && !existingCategories.find(c => c.name.toLowerCase() === t.category.toLowerCase())) {
            existingCategories.push({ id: null, name: t.category });
          }
        }
        break;
      } catch (e) {
        retries++;
        console.log(`  Error (intento ${retries}): ${e.message}`);
        if (retries < 3) await sleep(2000);
      }
    }

    if (i + BATCH < products.length) await sleep(1000);
  }

  console.log(`\n   Total traducidos: ${Object.keys(translations).length}/${products.length}`);

  // 4. Apply translations
  console.log('\n4. Aplicando traducciones al Excel...');
  let missing = 0;
  const finalRows = products.map(r => {
    const sku = String(r['Codigo'] || '').trim();
    const t = translations[sku];
    if (!t) { missing++; }
    return {
      'Codigo': sku,
      'Código Barra': r['Código Barra'],
      'Categoria': t ? t.category : r['Categoria'],
      'Subcategoria': t ? t.subcategory : '',
      'Nombre ES': r['Nombre del producto 2'] || (t ? t.nameEs : ''),
      'Nombre Traducido': t ? t.nameEs : '',
      'Nombre CN': r['Nombre del producto 1'] || '',
      'Precio Retail': r['Precio por paquete'],
      'Precio Caja': r['Precio por caja'],
      'Stock': r['Stock'],
    };
  });

  console.log(`   ${missing} sin traducción`);

  // 5. Save main Excel
  const outWb = XLSX.utils.book_new();
  const outWs = XLSX.utils.json_to_sheet(finalRows);
  XLSX.utils.book_append_sheet(outWb, outWs, 'Productos');
  const outPath = 'C:/Proyectos/PROJECT YAXSEL/excels/productos_traducidos.xlsx';
  XLSX.writeFile(outWb, outPath);
  console.log(`\n5. ✅ Excel guardado: ${outPath}`);

  // 6. Save categories summary
  const catMap = {};
  finalRows.forEach(r => {
    if (!r['Categoria']) return;
    if (!catMap[r['Categoria']]) catMap[r['Categoria']] = new Set();
    if (r['Subcategoria']) catMap[r['Categoria']].add(r['Subcategoria']);
  });

  const catRows = [];
  for (const [cat, subs] of Object.entries(catMap).sort()) {
    if (subs.size === 0) {
      catRows.push({ Categoria: cat, Subcategoria: '', Productos: finalRows.filter(r => r['Categoria'] === cat).length });
    } else {
      for (const sub of [...subs].sort()) {
        catRows.push({ Categoria: cat, Subcategoria: sub, Productos: finalRows.filter(r => r['Categoria'] === cat && r['Subcategoria'] === sub).length });
      }
    }
  }

  const catWb = XLSX.utils.book_new();
  const catWs = XLSX.utils.json_to_sheet(catRows);
  XLSX.utils.book_append_sheet(catWb, catWs, 'Categorias');
  const catPath = 'C:/Proyectos/PROJECT YAXSEL/excels/categorias_generadas.xlsx';
  XLSX.writeFile(catWb, catPath);

  console.log(`6. ✅ Categorías guardadas: ${catPath}`);
  console.log(`   ${Object.keys(catMap).length} categorías, ${catRows.length} subcategorías\n`);
  console.log('=== COMPLETADO ===');
}

main().catch(e => { console.error('\nERROR FATAL:', e.message); process.exit(1); });
