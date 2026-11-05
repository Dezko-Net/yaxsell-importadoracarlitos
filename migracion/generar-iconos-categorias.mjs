#!/usr/bin/env node
/**
 * generar-iconos-categorias.mjs
 *
 * Genera 13 iconos de categorías de supermercado con Gemini 2.5 Flash Image (Vertex AI + ADC)
 * Sube cada imagen a Firebase Storage (yaxselldemo) y actualiza la categoría con iconUrl.
 *
 * Uso:
 *   node migracion/generar-iconos-categorias.mjs
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Crear carpeta local
try { mkdirSync('migracion/iconos-categorias', { recursive: true }); } catch {}

// ── Config ADC ──
const ADC_PATH = 'C:\\Users\\Yanpo\\AppData\\Roaming\\gcloud\\application_default_credentials.json';
const VERTEX_PROJECT = 'asistoraerp';
const VERTEX_LOCATION = 'us-central1';
const VERTEX_MODEL = 'gemini-2.5-flash-image';
const VERTEX_ENDPOINT = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;

// ── Prompts ──
const CATEGORIAS = [
  { name: 'Alimentos y Despensa', prompt: 'Generate a flat minimalist icon of a rice bowl and pantry items, clean simple vector style, white background, no text, centered' },
  { name: 'Bebidas', prompt: 'Generate a flat minimalist icon of a beverage bottle and glass, clean simple vector style, white background, no text, centered' },
  { name: 'Lácteos y Huevos', prompt: 'Generate a flat minimalist icon of a milk carton and eggs, clean simple vector style, white background, no text, centered' },
  { name: 'Carnes y Pescados', prompt: 'Generate a flat minimalist icon of meat and fish, clean simple vector style, white background, no text, centered' },
  { name: 'Frutas y Verduras', prompt: 'Generate a flat minimalist icon of fresh fruits and vegetables, clean simple vector style, white background, no text, centered' },
  { name: 'Panadería y Repostería', prompt: 'Generate a flat minimalist icon of bread and cake, clean simple vector style, white background, no text, centered' },
  { name: 'Snacks y Dulces', prompt: 'Generate a flat minimalist icon of chips and candy, clean simple vector style, white background, no text, centered' },
  { name: 'Limpieza del Hogar', prompt: 'Generate a flat minimalist icon of cleaning spray and sponge, clean simple vector style, white background, no text, centered' },
  { name: 'Cuidado Personal', prompt: 'Generate a flat minimalist icon of shampoo and soap, clean simple vector style, white background, no text, centered' },
  { name: 'Bebé y Niños', prompt: 'Generate a flat minimalist icon of a baby bottle and diaper, clean simple vector style, white background, no text, centered' },
  { name: 'Mascotas', prompt: 'Generate a flat minimalist icon of a dog and cat food bowl, clean simple vector style, white background, no text, centered' },
  { name: 'Congelados', prompt: 'Generate a flat minimalist icon of a snowflake and frozen food, clean simple vector style, white background, no text, centered' },
  { name: 'Otros', prompt: 'Generate a flat minimalist icon of a shopping basket, clean simple vector style, white background, no text, centered' },
];

async function getAccessToken() {
  const adc = JSON.parse(readFileSync(ADC_PATH, 'utf-8'));
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: adc.client_id,
      client_secret: adc.client_secret,
      refresh_token: adc.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Error obteniendo token: ${err}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function generateImage(prompt, accessToken) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };

  const res = await fetch(VERTEX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vertex AI error (${res.status}): ${err}`);
  }

  const data = await res.json();
  // Buscar la parte de la imagen en la respuesta
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }
  throw new Error('No se recibió imagen en la respuesta: ' + JSON.stringify(data).slice(0, 300));
}

async function main() {
  console.log('\n═══ GENERAR ICONOS DE CATEGORÍAS CON GEMINI 2.5 FLASH IMAGE (Vertex AI + ADC) ═══\n');
  console.log(`  Proyecto: ${VERTEX_PROJECT}`);
  console.log(`  Modelo: ${VERTEX_MODEL}`);
  console.log(`  Categorías: ${CATEGORIAS.length}\n`);

  // ── Firebase init (yaxselldemo) ──
  const saPath = 'scripts/yaxselldemo-key.json';
  if (!existsSync(saPath)) {
    console.error('  No se encontró scripts/yaxselldemo-key.json');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  const app = initializeApp({
    credential: cert(sa),
    storageBucket: `${sa.project_id}.firebasestorage.app`,
  });
  const db = getFirestore(app, '(default)');
  const bucket = getStorage(app).bucket();

  // ── Obtener access token ──
  console.log('  Obteniendo access token de ADC...');
  const accessToken = await getAccessToken();
  console.log('  ✓ Token obtenido\n');

  // ── Generar y subir cada icono ──
  let success = 0;
  let failed = 0;

  for (let i = 0; i < CATEGORIAS.length; i++) {
    const cat = CATEGORIAS[i];
    console.log(`  [${i + 1}/${CATEGORIAS.length}] Generando: ${cat.name}...`);

    try {
      const imageBuffer = await generateImage(cat.prompt, accessToken);
      console.log(`    ✓ Imagen generada (${(imageBuffer.length / 1024).toFixed(0)} KB)`);

      // Guardar copia local
      const slug = cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const localPath = `migracion/iconos-categorias/icono-${slug}.png`;
      writeFileSync(localPath, imageBuffer);
      console.log(`    ✓ Copia local: ${localPath}`);

      // Subir a Storage
      const fileName = `yaxselldemo/categorias/icono-${slug}.png`;
      const file = bucket.file(fileName);
      await file.save(imageBuffer, {
        metadata: { contentType: 'image/png' },
      });
      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      console.log(`    ✓ Subida a Storage: ${publicUrl}`);

      // Actualizar categoría en Firestore
      const catSnap = await db.collection('categories').where('name', '==', cat.name).limit(1).get();
      if (catSnap.empty) {
        console.log(`    ⚠ Categoría no encontrada en Firestore: ${cat.name}`);
      } else {
        await catSnap.docs[0].ref.update({ iconUrl: publicUrl });
        console.log(`    ✓ Categoría actualizada con icono`);
      }

      success++;
    } catch (e) {
      console.error(`    ✗ Error: ${e.message}`);
      failed++;
    }

    console.log('');
  }

  console.log(`  ✓ Listo. ${success} exitosas, ${failed} fallidas.\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
