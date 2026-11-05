import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';

const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const PROJECT_ID = '698f6de50012f9df7ebd';
const DATABASE_ID = '67f1dc940037b3d367bb';
const GEMINI_KEY = 'AIzaSyDg0RP4L104VRekl6hGWqagi3B1lAG3xlw';

// ── Appwrite REST helpers ──────────────────────────────────────
async function appwriteGet(path) {
  const res = await fetch(`${APPWRITE_ENDPOINT}${path}`, {
    headers: {
      'X-Appwrite-Project': PROJECT_ID,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Appwrite error ${res.status}: ${path}`);
  return res.json();
}

async function fetchAllDocs(collectionId) {
  let docs = [];
  let offset = 0;
  while (true) {
    const data = await appwriteGet(
      `/databases/${DATABASE_ID}/collections/${collectionId}/documents?limit=100&offset=${offset}`
    );
    docs = docs.concat(data.documents);
    if (docs.length >= data.total) break;
    offset += 100;
  }
  return docs;
}

// ── Gemini batch translate ─────────────────────────────────────
async function translateBatch(items, existingCategories) {
  const catList = existingCategories.map(c => `${c.name}${c.subcategories?.length ? ` (subs: ${c.subcategories.join(', ')})` : ''}`).join('\n');

  const lines = items.map(i => `SKU:${i.sku}|NOMBRE_CN:${i.nameCn}|CAT_CN:${i.categoryRaw}`).join('\n');

  const prompt = `Eres experto en cosméticos, belleza y productos de Asia para el mercado latinoamericano.

CATEGORÍAS YA EXISTENTES EN LA TIENDA (úsalas cuando coincidan):
${catList}

TAREA: Para cada producto a continuación, devuelve exactamente:
SKU:xxx|NOMBRE_ES:traducción_española|CATEGORIA:categoría|SUBCATEGORIA:subcategoría

REGLAS:
- Traduce NOMBRE_CN del chino al español natural (mantén marcas como SADOER, BIOAQUA, etc.)
- Si NOMBRE_CN tiene algo en español, mejóralo levemente si hace falta pero no cambies marcas
- CATEGORIA: usa una de las existentes si aplica; si no, crea una nueva en español
- SUBCATEGORIA: asigna una subcategoría lógica (puede ser nueva si tiene sentido)
- Responde SOLO con las líneas en el formato indicado, sin nada más

PRODUCTOS:
${lines}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const data = await res.json();
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

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('=== TRADUCCIÓN DE PRODUCTOS QIANJI ===\n');

  // 1. Fetch categories from Appwrite
  console.log('1. Cargando categorías de Appwrite...');
  let existingCategories = [];
  try {
    const cats = await fetchAllDocs('categories');
    existingCategories = cats.map(c => ({
      id: c.$id,
      name: c.NAME || c.name || '',
      subcategories: [],
    }));
    console.log(`   ${existingCategories.length} categorías encontradas:`, existingCategories.map(c => c.name).join(', '));
  } catch (e) {
    console.warn('   No se pudieron cargar categorías:', e.message);
    existingCategories = [];
  }

  // 2. Load Excel
  console.log('\n2. Cargando Excel de productos...');
  const wb = XLSX.readFile('C:/Proyectos/PROJECT YAXSEL/excels/productos_con_stock.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const products = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`   ${products.length} productos a procesar`);

  // 3. Translate in batches of 200
  const BATCH = 200;
  const translations = {};
  const totalBatches = Math.ceil(products.length / BATCH);

  console.log(`\n3. Traduciendo en ${totalBatches} lotes de ${BATCH}...`);

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    console.log(`   Lote ${batchNum}/${totalBatches} (${batch.length} productos)...`);

    const items = batch.map(r => ({
      sku: String(r['Codigo'] || '').trim(),
      nameCn: String(r['Nombre del producto 1'] || '').trim(),
      categoryRaw: String(r['Categoria'] || '').trim(),
    }));

    try {
      const result = await translateBatch(items, existingCategories);
      Object.assign(translations, result);
      const translated = Object.keys(result).length;
      console.log(`   ✓ ${translated}/${batch.length} traducidos en este lote`);

      // Collect new categories from this batch
      for (const t of Object.values(result)) {
        if (t.category && !existingCategories.find(c => c.name.toLowerCase() === t.category.toLowerCase())) {
          existingCategories.push({ id: null, name: t.category, subcategories: [] });
        }
      }
    } catch (e) {
      console.error(`   ✗ Error en lote ${batchNum}:`, e.message);
    }

    // Delay between batches to avoid rate limits
    if (i + BATCH < products.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n   Total traducidos: ${Object.keys(translations).length}/${products.length}`);

  // 4. Apply translations to Excel rows
  console.log('\n4. Aplicando traducciones...');
  let missing = 0;
  const finalRows = products.map(r => {
    const sku = String(r['Codigo'] || '').trim();
    const t = translations[sku];
    if (!t) {
      missing++;
      return {
        Codigo: sku,
        'Código Barra': r['Código Barra'],
        Categoria: r['Categoria'],
        Subcategoria: '',
        'Nombre ES': r['Nombre del producto 2'] || '',
        'Nombre CN': r['Nombre del producto 1'] || '',
        'Precio Retail': r['Precio por paquete'],
        'Precio Caja': r['Precio por caja'],
        Stock: r['Stock'],
      };
    }
    return {
      Codigo: sku,
      'Código Barra': r['Código Barra'],
      Categoria: t.category,
      Subcategoria: t.subcategory,
      'Nombre ES': r['Nombre del producto 2'] || t.nameEs,
      'Nombre CN': r['Nombre del producto 1'] || '',
      'Precio Retail': r['Precio por paquete'],
      'Precio Caja': r['Precio por caja'],
      Stock: r['Stock'],
    };
  });

  console.log(`   ${missing} sin traducción (mantienen datos originales)`);

  // 5. Save result
  const outWb = XLSX.utils.book_new();
  const outWs = XLSX.utils.json_to_sheet(finalRows);
  XLSX.utils.book_append_sheet(outWb, outWs, 'Productos Traducidos');

  const outPath = 'C:/Proyectos/PROJECT YAXSEL/excels/productos_traducidos.xlsx';
  XLSX.writeFile(outWb, outPath);
  console.log(`\n5. ✅ Guardado en: ${outPath}`);

  // 6. Save unique categories list
  const allCats = {};
  finalRows.forEach(r => {
    if (r.Categoria) {
      if (!allCats[r.Categoria]) allCats[r.Categoria] = new Set();
      if (r.Subcategoria) allCats[r.Categoria].add(r.Subcategoria);
    }
  });

  const catRows = [];
  for (const [cat, subs] of Object.entries(allCats)) {
    if (subs.size === 0) {
      catRows.push({ Categoria: cat, Subcategoria: '' });
    } else {
      for (const sub of subs) {
        catRows.push({ Categoria: cat, Subcategoria: sub });
      }
    }
  }

  const catWb = XLSX.utils.book_new();
  const catWs = XLSX.utils.json_to_sheet(catRows);
  XLSX.utils.book_append_sheet(catWb, catWs, 'Categorias');
  XLSX.writeFile(catWb, 'C:/Proyectos/PROJECT YAXSEL/excels/categorias_generadas.xlsx');

  console.log(`\n6. ✅ Categorías únicas guardadas en: categorias_generadas.xlsx`);
  console.log(`   Total categorías: ${Object.keys(allCats).length}`);
  console.log(`   Total subcategorías únicas: ${catRows.length}`);
  console.log('\n=== PROCESO COMPLETADO ===');
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1); });
