#!/usr/bin/env node
/**
 * fix-categorias.mjs  v2
 * Usa la base de datos "donbalato" (no la default)
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const log  = (s) => console.log(s);
const ok   = (s) => console.log("  OK: " + s);
const warn = (s) => console.log("  WARN: " + s);

const sa = JSON.parse(readFileSync(resolve(ROOT, "scripts/yaxselldemo-key.json"), "utf-8"));
const app = initializeApp({
  credential: cert(sa),
  storageBucket: sa.project_id + ".firebasestorage.app",
});

// *** CLAVE: usar la base de datos "donbalato" ***
const db = getFirestore(app, "donbalato");
db.settings({ ignoreUndefinedProperties: true });

const storage = getStorage(app);
const bucket  = storage.bucket();

const CAT_MAP = {
  "cat_electronica_tech": "cat_tecnologia_audio",
  "cat_hogar_cocina":     "cat_cocina_menaje",
  "cat_aseo_limpieza":    "cat_limpieza_aseo",
  "cat_juguetes_ninos":   "cat_libreria_jugueteria",
  "cat_moda_calzado":     "cat_temporada_bazar",
  "cat_general":          "cat_hogar_organizacion",
  "cat_mascotas":         "cat_temporada_bazar",
};

const ARTIFACTS_DIR = "C:/Users/Yanpo/.gemini/antigravity/brain/1c22142b-16e1-4d29-8000-4352e3b1a06f";
const IMAGES = [
  { file: "cat_belleza_salud_1788880527081.jpg",            catId: "cat_belleza_salud",          storageName: "belleza-salud.jpg" },
  { file: "cat_hogar_organizacion_1788880541696.jpg",       catId: "cat_hogar_organizacion",     storageName: "hogar-organizacion.jpg" },
  { file: "cat_cocina_menaje_1788880558175.jpg",            catId: "cat_cocina_menaje",          storageName: "cocina-menaje.jpg" },
  { file: "cat_limpieza_aseo_1788880569685.jpg",            catId: "cat_limpieza_aseo",          storageName: "limpieza-aseo.jpg" },
  { file: "cat_tecnologia_audio_1788880840498.jpg",         catId: "cat_tecnologia_audio",       storageName: "tecnologia-audio.jpg" },
  { file: "cat_herramientas_iluminacion_1788880867033.jpg", catId: "cat_herramientas_iluminacion", storageName: "herramientas-iluminacion.jpg" },
  { file: "cat_libreria_jugueteria_1788880892146.jpg",      catId: "cat_libreria_jugueteria",    storageName: "libreria-jugueteria.jpg" },
  { file: "cat_temporada_bazar_1788880904842.jpg",          catId: "cat_temporada_bazar",        storageName: "temporada-bazar.jpg" },
];

async function main() {
  log("\n=== FIX CATEGORIAS Importadora Carlitos (db: donbalato) ===\n");

  // PASO 1: Remapear CATEGORYIDs en productos
  log("PASO 1: Remapeando CATEGORYID en productos...");
  const prodSnap = await db.collection("products").limit(1000).get();
  log("  Total productos en DB donbalato: " + prodSnap.size);

  // Distribucion actual
  const distrib = {};
  for (const d of prodSnap.docs) {
    const cat = d.data().CATEGORYID || "__sin__";
    distrib[cat] = (distrib[cat] || 0) + 1;
  }
  log("  Distribucion actual:");
  for (const [k, v] of Object.entries(distrib).sort((a,b)=>b[1]-a[1])) {
    log("    " + String(v).padStart(4) + "  " + k + (CAT_MAP[k] ? "  ->  " + CAT_MAP[k] : ""));
  }

  const batches = [];
  let batch = db.batch();
  let ops = 0, remapped = 0;
  for (const doc of prodSnap.docs) {
    const oldCat = doc.data().CATEGORYID;
    const newCat = CAT_MAP[oldCat];
    if (newCat) {
      batch.update(doc.ref, { CATEGORYID: newCat });
      ops++; remapped++;
      if (ops === 499) { batches.push(batch); batch = db.batch(); ops = 0; }
    }
  }
  if (ops > 0) batches.push(batch);
  for (const b of batches) await b.commit();
  ok("Productos remapeados: " + remapped + " / " + prodSnap.size);

  // PASO 2: Las imagenes ya estan en Storage (subidas antes), solo obtenemos URLs
  log("\nPASO 2: Construyendo URLs de imagenes (ya subidas a Storage)...");
  const catUrls = {};
  for (const img of IMAGES) {
    const dest = "yerko/categorias/" + img.storageName;
    const url = "https://storage.googleapis.com/" + bucket.name + "/" + dest;
    catUrls[img.catId] = url;
    ok(img.catId + " => " + img.storageName);
  }

  // PASO 3: Actualizar BACKGROUND_IMAGE_URL en categories
  log("\nPASO 3: Actualizando BACKGROUND_IMAGE_URL en categorias (db: donbalato)...");
  const catSnap = await db.collection("categories").get();
  log("  Total categorias en DB: " + catSnap.size);
  const catBatch = db.batch();
  let updated = 0;
  for (const doc of catSnap.docs) {
    const url = catUrls[doc.id];
    if (url) {
      catBatch.update(doc.ref, { BACKGROUND_IMAGE_URL: url });
      ok(doc.id + " -> OK");
      updated++;
    } else {
      warn(doc.id + " -> sin imagen asignada");
    }
  }
  await catBatch.commit();
  ok("Categorias actualizadas: " + updated);

  log("\n=== RESULTADO ===");
  log("  Productos remapeados: " + remapped);
  log("  Categorias con img:   " + updated);
  log("\n  Listo! Reinicia el server para ver los cambios.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
