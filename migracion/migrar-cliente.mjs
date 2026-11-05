#!/usr/bin/env node
/**
 * migrar-cliente.mjs
 * 
 * Script automatizado para migrar el motor YAXSELL a un nuevo proyecto Firebase.
 * 
 * Uso:
 *   node migracion/migrar-cliente.mjs
 * 
 * El script pide interactivamente los datos del nuevo proyecto y hace todo:
 *   1. Actualiza la config de Firebase en 4 archivos
 *   2. Actualiza .env.local
 *   3. Reemplaza referencias hardcodeadas (URLs de Storage, nombres de marca)
 *   4. Crea colecciones en Firestore con datos seed
 *   5. Crea usuario admin en Firebase Auth
 *   6. Configura el logo
 *   7. Verifica el build
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const log = (s) => console.log(s);
const ok = (s) => console.log(`  \u2713 ${s}`);
const err = (s) => console.error(`  \u2717 ${s}`);
const section = (s) => console.log(`\n\u2550\u2550\u2550 ${s} \u2550\u2550\u2550`);

// ═══════════════════════════════════════════════════════════════
// DATOS SEED (compartido con seed-firestore.mjs)
// ═══════════════════════════════════════════════════════════════
const placeholder = (text, color = 'ff6b9d') =>
  `https://placehold.co/600x600/${color}/fff?text=${encodeURIComponent(text)}`;

function getSeedData(tenantName, storeName, logoUrl) {
  const categories = [
    { name: 'Skincare', slug: 'skincare', iconUrl: 'https://placehold.co/100x100/ff6b9d/fff?text=Skincare', color: '#ff6b9d', order: 0 },
    { name: 'Maquillaje', slug: 'maquillaje', iconUrl: 'https://placehold.co/100x100/9b59b6/fff?text=Makeup', color: '#9b59b6', order: 1 },
    { name: 'Cabello', slug: 'cabello', iconUrl: 'https://placehold.co/100x100/3498db/fff?text=Cabello', color: '#3498db', order: 2 },
    { name: 'Perfumes', slug: 'perfumes', iconUrl: 'https://placehold.co/100x100/e67e22/fff?text=Perfumes', color: '#e67e22', order: 3 },
    { name: 'Accesorios', slug: 'accesorios', iconUrl: 'https://placehold.co/100x100/2ecc71/fff?text=Accesorios', color: '#2ecc71', order: 4 },
    { name: 'Hogar y Cocina', slug: 'hogar-y-cocina', iconUrl: 'https://placehold.co/100x100/f39c12/fff?text=Hogar', color: '#f39c12', order: 5 },
  ];

  const subcategoriesData = [
    { name: 'Hidratantes', parentCat: 'Skincare' },
    { name: 'Sérums', parentCat: 'Skincare' },
    { name: 'Limpiadores', parentCat: 'Skincare' },
    { name: 'Protectores Solar', parentCat: 'Skincare' },
    { name: 'Bases', parentCat: 'Maquillaje' },
    { name: 'Labiales', parentCat: 'Maquillaje' },
    { name: 'Sombras', parentCat: 'Maquillaje' },
    { name: 'Máscaras', parentCat: 'Maquillaje' },
    { name: 'Shampoo', parentCat: 'Cabello' },
    { name: 'Acondicionador', parentCat: 'Cabello' },
    { name: 'Florales', parentCat: 'Perfumes' },
    { name: 'Amaderados', parentCat: 'Perfumes' },
    { name: 'Brochas', parentCat: 'Accesorios' },
    { name: 'Espejos', parentCat: 'Accesorios' },
    { name: 'Difusores', parentCat: 'Hogar y Cocina' },
  ];

  const products = [
    { NAME: 'Crema Hidratante Facial 50ml', DESCRIPTION: 'Crema hidratante con ácido hialurónico.', PRICE: 12990, CURRENTPRICE: 12990, COST: 6000, STOCK: 45, IMAGEURL: placeholder('Crema', 'ff6b9d'), RATING: 4.5, NUMREVIEWS: 12, SOLDQUANTITY: 120, TAGS: ['skincare'], sku: 'SKN-001', barcode: '7800000000011', WHOLESALEPRICE: 10990, WHOLESALEMINQUANTITY: 6, section: 0 },
    { NAME: 'Serum Vitamina C 30ml', DESCRIPTION: 'Serum antioxidante con vitamina C al 20%.', PRICE: 18990, CURRENTPRICE: 15990, COST: 8000, STOCK: 30, IMAGEURL: placeholder('Serum', 'ff6b9d'), RATING: 4.8, NUMREVIEWS: 25, SOLDQUANTITY: 200, TAGS: ['skincare'], sku: 'SKN-002', barcode: '7800000000028', WHOLESALEPRICE: 14990, WHOLESALEMINQUANTITY: 6, section: 0 },
    { NAME: 'Gel Limpiador Facial 200ml', DESCRIPTION: 'Gel limpiador suave con ácido salicílico.', PRICE: 9990, CURRENTPRICE: 9990, COST: 4000, STOCK: 60, IMAGEURL: placeholder('Gel', 'ff6b9d'), RATING: 4.3, NUMREVIEWS: 8, SOLDQUANTITY: 80, TAGS: ['skincare'], sku: 'SKN-003', barcode: '7800000000035', WHOLESALEPRICE: 7990, WHOLESALEMINQUANTITY: 12, section: 0 },
    { NAME: 'Protector Solar FPS50 60ml', DESCRIPTION: 'Protector solar de toque seco FPS50.', PRICE: 14990, CURRENTPRICE: 11990, COST: 5500, STOCK: 0, IMAGEURL: placeholder('Solar', 'ff6b9d'), RATING: 4.7, NUMREVIEWS: 30, SOLDQUANTITY: 350, TAGS: ['skincare'], sku: 'SKN-004', barcode: '7800000000042', WHOLESALEPRICE: 9990, WHOLESALEMINQUANTITY: 6, section: 0 },
    { NAME: 'Base Líquida Matte 30ml', DESCRIPTION: 'Base de larga duración acabado mate.', PRICE: 15990, CURRENTPRICE: 13990, COST: 7000, STOCK: 25, IMAGEURL: placeholder('Base', '9b59b6'), RATING: 4.6, NUMREVIEWS: 18, SOLDQUANTITY: 150, TAGS: ['maquillaje'], sku: 'MKP-001', barcode: '7800000000059', WHOLESALEPRICE: 11990, WHOLESALEMINQUANTITY: 6, section: 0 },
    { NAME: 'Labial Mate Rojo Carmín', DESCRIPTION: 'Labial mate de larga duración.', PRICE: 7990, CURRENTPRICE: 6990, COST: 3000, STOCK: 80, IMAGEURL: placeholder('Labial', '9b59b6'), RATING: 4.4, NUMREVIEWS: 22, SOLDQUANTITY: 300, TAGS: ['maquillaje'], sku: 'MKP-002', barcode: '7800000000066', WHOLESALEPRICE: 5990, WHOLESALEMINQUANTITY: 12, section: 0 },
    { NAME: 'Paleta de Sombras 12 colores', DESCRIPTION: 'Paleta de sombras mate y brillo.', PRICE: 22990, CURRENTPRICE: 18990, COST: 10000, STOCK: 15, IMAGEURL: placeholder('Paleta', '9b59b6'), RATING: 4.9, NUMREVIEWS: 35, SOLDQUANTITY: 180, TAGS: ['maquillaje'], sku: 'MKP-003', barcode: '7800000000073', WHOLESALEPRICE: 15990, WHOLESALEMINQUANTITY: 4, section: 0 },
    { NAME: 'Máscara de Pestañas Volume', DESCRIPTION: 'Máscara waterproof volumen extremo.', PRICE: 8990, CURRENTPRICE: 7990, COST: 3500, STOCK: 50, IMAGEURL: placeholder('Mascara', '9b59b6'), RATING: 4.2, NUMREVIEWS: 10, SOLDQUANTITY: 90, TAGS: ['maquillaje'], sku: 'MKP-004', barcode: '7800000000080', WHOLESALEPRICE: 6990, WHOLESALEMINQUANTITY: 12, section: 0 },
    { NAME: 'Shampoo Reparador 400ml', DESCRIPTION: 'Shampoo con keratina para cabello dañado.', PRICE: 8990, CURRENTPRICE: 7990, COST: 3500, STOCK: 40, IMAGEURL: placeholder('Shampoo', '3498db'), RATING: 4.5, NUMREVIEWS: 15, SOLDQUANTITY: 110, TAGS: ['cabello'], sku: 'CAB-001', barcode: '7800000000097', WHOLESALEPRICE: 6990, WHOLESALEMINQUANTITY: 12, section: 0 },
    { NAME: 'Acondicionador Hidratante 400ml', DESCRIPTION: 'Acondicionador con aceite de argán.', PRICE: 8990, CURRENTPRICE: 7990, COST: 3500, STOCK: 35, IMAGEURL: placeholder('Acond', '3498db'), RATING: 4.3, NUMREVIEWS: 9, SOLDQUANTITY: 75, TAGS: ['cabello'], sku: 'CAB-002', barcode: '7800000000103', WHOLESALEPRICE: 6990, WHOLESALEMINQUANTITY: 12, section: 0 },
    { NAME: 'Perfume Floral 100ml', DESCRIPTION: 'Eau de parfum floral jazmín y rosa.', PRICE: 39990, CURRENTPRICE: 34990, COST: 18000, STOCK: 20, IMAGEURL: placeholder('Perfume', 'e67e22'), RATING: 4.8, NUMREVIEWS: 28, SOLDQUANTITY: 95, TAGS: ['perfumes'], sku: 'PRF-001', barcode: '7800000000110', WHOLESALEPRICE: 29990, WHOLESALEMINQUANTITY: 4, section: 0 },
    { NAME: 'Perfume Amaderado 90ml', DESCRIPTION: 'Fragancia amaderada sándalo y vainilla.', PRICE: 44990, CURRENTPRICE: 38990, COST: 20000, STOCK: 10, IMAGEURL: placeholder('Perfume', 'e67e22'), RATING: 4.7, NUMREVIEWS: 14, SOLDQUANTITY: 50, TAGS: ['perfumes'], sku: 'PRF-002', barcode: '7800000000127', WHOLESALEPRICE: 32990, WHOLESALEMINQUANTITY: 4, section: 0 },
    { NAME: 'Set de Brochas 12 piezas', DESCRIPTION: 'Set profesional de brochas con estuche.', PRICE: 12990, CURRENTPRICE: 9990, COST: 4500, STOCK: 30, IMAGEURL: placeholder('Brochas', '2ecc71'), RATING: 4.5, NUMREVIEWS: 16, SOLDQUANTITY: 130, TAGS: ['accesorios'], sku: 'ACC-001', barcode: '7800000000134', WHOLESALEPRICE: 7990, WHOLESALEMINQUANTITY: 6, section: 0 },
    { NAME: 'Espejo LED con Aumento 5x', DESCRIPTION: 'Espejo con iluminación LED y aumento 5x.', PRICE: 15990, CURRENTPRICE: 12990, COST: 6000, STOCK: 18, IMAGEURL: placeholder('Espejo', '2ecc71'), RATING: 4.4, NUMREVIEWS: 7, SOLDQUANTITY: 40, TAGS: ['accesorios'], sku: 'ACC-002', barcode: '7800000000141', WHOLESALEPRICE: 9990, WHOLESALEMINQUANTITY: 6, section: 0 },
    { NAME: 'Difusor Aromático 200ml', DESCRIPTION: 'Difusor ultrasonido con luz LED 7 colores.', PRICE: 19990, CURRENTPRICE: 16990, COST: 8000, STOCK: 22, IMAGEURL: placeholder('Difusor', 'f39c12'), RATING: 4.6, NUMREVIEWS: 20, SOLDQUANTITY: 85, TAGS: ['hogar'], sku: 'HOG-001', barcode: '7800000000158', WHOLESALEPRICE: 13990, WHOLESALEMINQUANTITY: 4, section: 0 },
  ];

  const banners = [
    { TITLE: `Bienvenida ${storeName}`, DESCRIPTION: 'Hasta 50% off en skincare y maquillaje', IMAGEURL: 'https://placehold.co/1200x400/ff6b9d/fff?text=Bienvenida', LINKURL: '/ofertas', DURATION: 5, ISACTIVE: true, DISPLAYORDER: 0, CLICKS: 0, VIEWS: 0 },
    { TITLE: 'Nuevos Perfumes', DESCRIPTION: 'Descubre nuestra nueva línea de fragancias', IMAGEURL: 'https://placehold.co/1200x400/e67e22/fff?text=Perfumes', LINKURL: '/categoria/perfumes', DURATION: 5, ISACTIVE: true, DISPLAYORDER: 1, CLICKS: 0, VIEWS: 0 },
    { TITLE: 'Envío Gratis sobre $30.000', DESCRIPTION: 'A todo Chile', IMAGEURL: 'https://placehold.co/1200x400/3498db/fff?text=Envio+Gratis', LINKURL: '', DURATION: 5, ISACTIVE: true, DISPLAYORDER: 2, CLICKS: 0, VIEWS: 0 },
  ];

  const agencies = [
    { name: 'RETIRO EN TIENDA', color: '#2ecc71', bg: '#e8f8f0', desc: 'Retira tu pedido en nuestra tienda', active: true },
    { name: 'STARKEN', color: '#e74c3c', bg: '#fdf0ef', desc: 'Envío por Starken a todo Chile', active: true },
    { name: 'PULLMAN CARGO', color: '#3498db', bg: '#e8f0fe', desc: 'Pullman Cargo', active: true },
    { name: 'VARMONTT', color: '#9b59b6', bg: '#f4ecf7', desc: 'VarMontt express', active: true },
    { name: 'BLUEXPRESS', color: '#2980b9', bg: '#ebf5fb', desc: 'BlueXpress', active: true },
    { name: 'CYC', color: '#16a085', bg: '#e8f8f5', desc: 'CYC courier', active: true },
    { name: 'TVP', color: '#f39c12', bg: '#fef9e7', desc: 'TVP transporte', active: true },
    { name: 'CRUZ DEL SUR', color: '#c0392b', bg: '#fdedec', desc: 'Cruz del Sur', active: true },
    { name: 'TRAMAR', color: '#7f8c8d', bg: '#f2f4f4', desc: 'Tramar', active: true },
    { name: '5SUR', color: '#d35400', bg: '#fdf2e9', desc: '5Sur zona sur', active: true },
    { name: 'MENA', color: '#27ae60', bg: '#e9f7ef', desc: 'MENA courier', active: true },
    { name: 'CACEM', color: '#8e44ad', bg: '#f4ecf7', desc: 'CACEM', active: true },
    { name: 'JT TRANSPORTES', color: '#2c3e50', bg: '#eaecee', desc: 'JT Transportes', active: true },
    { name: 'STARKI', color: '#e67e22', bg: '#fdf2e9', desc: 'Starki express', active: true },
  ];

  return { categories, subcategoriesData, products, banners, agencies };
}

// ═══════════════════════════════════════════════════════════════
// FUNCIONES DE ACTUALIZACIÓN DE ARCHIVOS
// ═══════════════════════════════════════════════════════════════

function updateFirebaseTs(projectId, apiKey, authDomain, storageBucket, messagingSenderId, appId, databaseId) {
  const filePath = join(PROJECT_ROOT, 'src/lib/firebase.ts');
  let content = readFileSync(filePath, 'utf-8');

  // Reemplazar el bloque FIREBASE_CONFIG completo
  content = content.replace(
    /const FIREBASE_CONFIG = \{[\s\S]*?\};/,
    `const FIREBASE_CONFIG = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            || "${apiKey}",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        || "${authDomain}",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         || "${projectId}",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     || "${storageBucket}",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID|| "${messagingSenderId}",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             || "${appId}",
};`
  );

  // Actualizar databaseId en getFirestore
  content = content.replace(
    /export const db\s*=\s*getFirestore\(app(?:,\s*'[^']*')?\);/,
    `export const db      = getFirestore(app, '${databaseId}');`
  );

  writeFileSync(filePath, content, 'utf-8');
  ok('src/lib/firebase.ts actualizado');
}

function updateDbServerTs(projectId, storageBucket, databaseId) {
  const filePath = join(PROJECT_ROOT, 'src/lib/db-server.ts');
  let content = readFileSync(filePath, 'utf-8');

  // getServerConfig
  content = content.replace(
    /projectId:\s*process\.env\.NEXT_PUBLIC_FIREBASE_PROJECT_ID\s*\|\|\s*'[^']*'/g,
    `projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '${projectId}'`
  );
  content = content.replace(
    /databaseId:\s*'[^']*'/g,
    `databaseId: '${databaseId}'`
  );

  // storageBucket en todos los lugares
  content = content.replace(
    /storageBucket:\s*process\.env\.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET\s*\|\|\s*'[^']*'/g,
    `storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '${storageBucket}'`
  );
  content = content.replace(
    /projectId:\s*process\.env\.NEXT_PUBLIC_FIREBASE_PROJECT_ID\s*\|\|\s*'[^']*'/g,
    `projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '${projectId}'`
  );

  // getAdminDb con databaseId
  content = content.replace(
    /adminDb = getFirestore\(getAdminApp\(\)(?:,\s*'[^']*')?\)/,
    `adminDb = getFirestore(getAdminApp(), '${databaseId}')`
  );

  // getServerFileUrl bucket fallback
  content = content.replace(
    /const bucket = process\.env\.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET\s*\|\|\s*'[^']*'/,
    `const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '${storageBucket}'`
  );

  writeFileSync(filePath, content, 'utf-8');
  ok('src/lib/db-server.ts actualizado');
}

function updateDbTs(projectId, databaseId, tenantName) {
  const filePath = join(PROJECT_ROOT, 'src/lib/db.ts');
  let content = readFileSync(filePath, 'utf-8');

  // DATABASE_ID
  content = content.replace(
    /export const DATABASE_ID = '[^']*';/,
    `export const DATABASE_ID = '${databaseId}';`
  );

  // MEDIA_PREFIXES
  content = content.replace(
    /export const MEDIA_PREFIXES = \{[\s\S]*?\} as const;/,
    `export const MEDIA_PREFIXES = {
  products:     '${tenantName}/productos/',
  banners:      '${tenantName}/banners/',
  categories:   '${tenantName}/categorias/',
  comprobantes: 'comprobantes/${tenantName}/',
  thumbnails:   '${tenantName}/thumbnails/',
  chat:         '${tenantName}/chat/',
} as const;`
  );

  // getFirebaseConfig
  content = content.replace(
    /projectId:\s*process\.env\.NEXT_PUBLIC_FIREBASE_PROJECT_ID\s*\|\|\s*'[^']*'/,
    `projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '${projectId}'`
  );
  content = content.replace(
    /databaseId:\s*'[^']*',\s*\n\s*bucketId:/,
    `databaseId: '${databaseId}',\n    bucketId:`
  );

  writeFileSync(filePath, content, 'utf-8');
  ok('src/lib/db.ts actualizado');
}

function updateCollectionsTs(databaseId, tenantName) {
  const filePath = join(PROJECT_ROOT, 'src/lib/collections.ts');
  let content = readFileSync(filePath, 'utf-8');

  content = content.replace(
    /export const DATABASE_ID = '[^']*';/,
    `export const DATABASE_ID = '${databaseId}';`
  );

  content = content.replace(
    /export const MEDIA_PREFIXES = \{[\s\S]*?\} as const;/,
    `export const MEDIA_PREFIXES = {
  products:     '${tenantName}/productos/',
  banners:      '${tenantName}/banners/',
  categories:   '${tenantName}/categorias/',
  comprobantes: 'comprobantes/${tenantName}/',
  thumbnails:   '${tenantName}/thumbnails/',
  chat:         '${tenantName}/chat/',
} as const;`
  );

  writeFileSync(filePath, content, 'utf-8');
  ok('src/lib/collections.ts actualizado');
}

function updateEnvLocal(config) {
  const filePath = join(PROJECT_ROOT, '.env.local');
  let content = '';

  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  }

  // Construir el nuevo .env.local
  const lines = [];

  // Preservar WhatsApp y otras vars que no sean Firebase
  if (content) {
    const existingLines = content.split('\n');
    for (const line of existingLines) {
      // Saltar líneas de Firebase y GOOGLE_APPLICATION_CREDENTIALS_JSON
      if (line.startsWith('NEXT_PUBLIC_FIREBASE_') ||
          line.startsWith('GOOGLE_CLOUD_PROJECT_ID') ||
          line.startsWith('GOOGLE_APPLICATION_CREDENTIALS_JSON')) {
        continue;
      }
      lines.push(line);
    }
  }

  // Asegurar que no haya líneas vacías duplicadas al final
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Agregar config Firebase nueva
  lines.push('');
  lines.push(`# Firebase config (${config.projectId})`);
  lines.push(`NEXT_PUBLIC_FIREBASE_API_KEY=${config.apiKey}`);
  lines.push(`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${config.authDomain}`);
  lines.push(`NEXT_PUBLIC_FIREBASE_PROJECT_ID=${config.projectId}`);
  lines.push(`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${config.storageBucket}`);
  lines.push(`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${config.messagingSenderId}`);
  lines.push(`NEXT_PUBLIC_FIREBASE_APP_ID=${config.appId}`);
  lines.push(`GOOGLE_CLOUD_PROJECT_ID=${config.projectId}`);
  lines.push(`GOOGLE_APPLICATION_CREDENTIALS_JSON=${config.saJsonString}`);

  writeFileSync(filePath, lines.join('\n'), 'utf-8');
  ok('.env.local actualizado');
}

function updateAdminAccess(adminEmail) {
  const filePath = join(PROJECT_ROOT, 'src/lib/admin-access.ts');
  const content = `/** Correo con acceso al panel /admin y a /inventario */
export const ADMIN_EMAIL = '${adminEmail}';

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
`;
  writeFileSync(filePath, content, 'utf-8');
  ok('src/lib/admin-access.ts actualizado');
}

function updateLayoutLogo(logoUrl) {
  if (!logoUrl) return;

  // Admin panel layout
  const adminLayoutPath = join(PROJECT_ROOT, 'src/app/admin/(panel)/layout.tsx');
  if (existsSync(adminLayoutPath)) {
    let content = readFileSync(adminLayoutPath, 'utf-8');
    // Reemplazar cualquier URL de logo en el Image src del top bar
    content = content.replace(
      /src="https:\/\/[^"]*logo[^"]*"/g,
      `src="${logoUrl}"`
    );
    writeFileSync(adminLayoutPath, content, 'utf-8');
    ok('src/app/admin/(panel)/layout.tsx logo actualizado');
  }

  // Vendor layout
  const vendorLayoutPath = join(PROJECT_ROOT, 'src/app/vendor/layout.tsx');
  if (existsSync(vendorLayoutPath)) {
    let content = readFileSync(vendorLayoutPath, 'utf-8');
    content = content.replace(
      /const LOGO_URL = '[^']*';/,
      `const LOGO_URL = '${logoUrl}';`
    );
    writeFileSync(vendorLayoutPath, content, 'utf-8');
    ok('src/app/vendor/layout.tsx logo actualizado');
  }
}

function updateSectionConfig(storeName, logoUrl) {
  const filePath = join(PROJECT_ROOT, 'src/lib/section-config.ts');
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf-8');

  // heroStoreName
  content = content.replace(
    /heroStoreName:\s*'[^']*'/g,
    `heroStoreName: '${storeName}'`
  );

  // heroStoreLogoMode → image si hay logo
  if (logoUrl) {
    content = content.replace(
      /heroStoreLogoMode:\s*'text'/g,
      `heroStoreLogoMode: 'image'`
    );
    content = content.replace(
      /heroStoreLogoUrl:\s*''/g,
      `heroStoreLogoUrl: '${logoUrl}'`
    );
    content = content.replace(
      /heroStoreLogoScrollUrl:\s*''/g,
      `heroStoreLogoScrollUrl: '${logoUrl}'`
    );
  }

  writeFileSync(filePath, content, 'utf-8');
  ok('src/lib/section-config.ts actualizado');
}

function updateLoyaltyLevels() {
  const filePath = join(PROJECT_ROOT, 'src/lib/loyalty-levels.ts');
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf-8');

  // Reemplazar nombres de tiers de Importadora Carlitos por genéricos
  content = content.replace(/Importadora Carlitos Bronze/g, 'Cliente Bronze');
  content = content.replace(/Importadora Carlitos Silver/g, 'Cliente Silver');
  content = content.replace(/Importadora Carlitos Gold/g, 'Cliente Gold');
  content = content.replace(/Importadora Carlitos Platinum/g, 'Cliente Platinum');
  content = content.replace(/Importadora Carlitos Diamond/g, 'Cliente Diamond');

  writeFileSync(filePath, content, 'utf-8');
  ok('src/lib/loyalty-levels.ts actualizado');
}

function updateLayoutMetadata(storeName) {
  const filePath = join(PROJECT_ROOT, 'src/app/layout.tsx');
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf-8');

  // Reemplazar "Importadora Carlitos" y "donbalatoivan" en metadata
  content = content.replace(/Importadora Carlitos/g, storeName);
  content = content.replace(/donbalatoivan\.cl/g, 'yaxsell.cl');
  content = content.replace(/Importadora Carlitos Iv\u00e1n/g, storeName);

  writeFileSync(filePath, content, 'utf-8');
  ok('src/app/layout.tsx metadata actualizado');
}

function updateSitemap() {
  const filePath = join(PROJECT_ROOT, 'src/app/sitemap.ts');
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf-8');
  content = content.replace(/donbalatoivan\.cl/g, 'yaxsell.cl');
  content = content.replace(/www\.donbalatoivan\.cl/g, 'yaxsell.cl');
  writeFileSync(filePath, content, 'utf-8');
  ok('src/app/sitemap.ts actualizado');
}

function replaceStorageUrls(oldProjectIds, newStorageBucket) {
  // Reemplazar URLs de Storage hardcodeadas en templates
  const newUrl = `https://storage.googleapis.com/${newStorageBucket}`;
  const newFirebasestorageUrl = `https://firebasestorage.googleapis.com/v0/b/${newStorageBucket}`;

  const templateDirs = [
    'src/templates',
    'src/components',
    'src/app',
    'src/lib',
  ];

  for (const dir of templateDirs) {
    const fullPath = join(PROJECT_ROOT, dir);
    if (!existsSync(fullPath)) continue;

    const files = findTsFiles(fullPath);

    for (const file of files) {
      let content = readFileSync(file, 'utf-8');
      let modified = false;

      for (const oldId of oldProjectIds) {
        const oldBucket = `${oldId}.firebasestorage.app`;
        const oldStorageUrl = `https://storage.googleapis.com/${oldBucket}`;
        const oldFirebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${oldBucket}`;

        if (content.includes(oldBucket)) {
          content = content.split(oldBucket).join(newStorageBucket);
          modified = true;
        }
      }

      if (modified) {
        writeFileSync(file, content, 'utf-8');
      }
    }
  }
  ok('URLs de Storage reemplazadas en templates');
}

/**
 * Reemplaza todas las referencias de marca del cliente anterior.
 * Esta es la función más importante — reemplaza ~500+ referencias en ~70 archivos.
 */
function replaceBrandReferences(storeName) {
  const brandShort = storeName.replace(/\s+(Demo|Tienda|Store)$/i, '').trim() || 'Yaxsell';
  const brandUpper = storeName.toUpperCase();
  const brandLower = storeName.toLowerCase();

  const REPLACEMENTS = [
    // Brand name - all variations of "Importadora Carlitos"
    ['Importadora Carlitos', storeName],
    ['Importadora Carlitos', storeName],
    ['Importadora Carlitos', brandUpper],
    ['Importadora Carlitos', brandUpper],
    ['Importadora Carlitos', brandLower],
    ['Importadora Carlitos', brandLower],
    ['Importadora Carlitos', brandShort],
    ['Importadora Carlitos', brandUpper],
    ['Importadora Carlitos', brandLower],
    // Email
    ['donbalatosoporte@gmail.com', `contacto@${brandLower.replace(/\s+/g, '')}.cl`],
    // AI persona name
    ['Balatin', 'Yaxbot'],
    // Standalone (after above to avoid double-replacing)
    ['balato', brandLower],
    ['BALATO', brandUpper],
    // Old project IDs in fallbacks
    ['asistoraerp', 'yaxselldemo'],
    ['geminai-449212', 'yaxselldemo'],
    // Old service account emails in signed URLs
    ['geminai-449212.iam.gserviceaccount.com', 'yaxselldemo.iam.gserviceaccount.com'],
    ['asistoraerp.iam.gserviceaccount.com', 'yaxselldemo.iam.gserviceaccount.com'],
    // Old domains
    ['donbalatoivan.cl', `${brandLower.replace(/\s+/g, '')}.cl`],
    ['donbalatomayorista.cl', `${brandLower.replace(/\s+/g, '')}.cl`],
    ['www.donbalatoivan.cl', `${brandLower.replace(/\s+/g, '')}.cl`],
    // Old tenant in Storage paths
    ['don-balato-ivan/', 'yaxselldemo/'],
    // Banking details (demo placeholders)
    ['78.267.426-9', '00.000.000-0'],
    ['78267426-9', '00000000-0'],
    ['1037879898', '0000000000'],
    ['Chacabuco 08', 'Av. Demo 123'],
    ['Estación Central', 'Santiago Centro'],
    // Phone numbers (demo placeholder)
    ['56962293893', '56912345678'],
    ['56936599658', '56912345678'],
    ['56999149712', '56912345678'],
    ['+56 9 6229 3893', '+56 9 1234 5678'],
    ['+56962293893', '+56912345678'],
    // Coupon codes
    ['KEVINCOCOCL', 'YAXSELLDEMO'],
    // Storage folder paths from old tenant
    ['KEVIN%26COCO/', 'demo/'],
    ['KEVINCOCO/', 'demo/'],
    ['IADESIGN/', 'demo/'],
  ];

  const templateDirs = ['src/templates', 'src/components', 'src/app', 'src/lib', 'src/services'];
  let totalReplaced = 0;
  let filesModified = 0;

  for (const dir of templateDirs) {
    const fullPath = join(PROJECT_ROOT, dir);
    if (!existsSync(fullPath)) continue;
    const files = findTsFiles(fullPath);
    for (const file of files) {
      let content = readFileSync(file, 'utf-8');
      let modified = false;
      for (const [old, newV] of REPLACEMENTS) {
        if (content.includes(old)) {
          const count = content.split(old).length - 1;
          content = content.split(old).join(newV);
          totalReplaced += count;
          modified = true;
        }
      }
      // Also replace signed Storage URLs with placeholders
      const signedUrlRegex = /https:\/\/storage\.googleapis\.com\/yaxselldemo\.firebasestorage\.app\/[^'"]+\?GoogleAccessId=[^'"]+/g;
      const matches = content.match(signedUrlRegex);
      if (matches) {
        for (const m of matches) {
          let replacement;
          if (m.includes('.mp4') || m.includes('realesrgan')) {
            replacement = 'https://placehold.co/800x600/1a1a2e/fff?text=Video+Demo';
          } else if (m.includes('logo') || m.includes('LOGO')) {
            replacement = 'https://placehold.co/200x60/1a1a2e/fff?text=' + encodeURIComponent(brandShort);
          } else {
            replacement = 'https://placehold.co/1200x400/f1f1f1/999?text=Banner+Demo';
          }
          content = content.split(m).join(replacement);
          modified = true;
        }
      }
      // Replace firebasestorage token URLs
      const fbSignedRegex = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/yaxselldemo\.firebasestorage\.app\/o\/[^'"]+\?alt=media&token=[^'"]+/g;
      const fbMatches = content.match(fbSignedRegex);
      if (fbMatches) {
        for (const m of fbMatches) {
          let replacement;
          if (m.includes('.mp4') || m.includes('realesrgan')) {
            replacement = 'https://placehold.co/800x600/1a1a2e/fff?text=Video+Demo';
          } else if (m.includes('logo') || m.includes('LOGO')) {
            replacement = 'https://placehold.co/200x60/1a1a2e/fff?text=' + encodeURIComponent(brandShort);
          } else {
            replacement = 'https://placehold.co/600x600/f1f1f1/999?text=Imagen+Demo';
          }
          content = content.split(m).join(replacement);
          modified = true;
        }
      }
      if (modified) {
        writeFileSync(file, content, 'utf-8');
        filesModified++;
      }
    }
  }
  ok(`Referencias de marca reemplazadas: ${totalReplaced} en ${filesModified} archivos`);
}

function findTsFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === '.next') continue;
          results.push(...findTsFiles(fullPath));
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.html')) {
          results.push(fullPath);
        }
      } catch {}
    }
  } catch {}
  return results;
}

// ═══════════════════════════════════════════════════════════════
// SEED FIRESTORE
// ═══════════════════════════════════════════════════════════════
async function seedFirestore(app, databaseId, tenantName, storeName, logoUrl) {
  const db = getFirestore(app, databaseId);
  db.settings({ ignoreUndefinedProperties: true });

  const seed = getSeedData(tenantName, storeName, logoUrl);

  // 1. Categorías
  log('\n  Creando categorías...');
  const catMap = {};
  const catBatch = db.batch();
  for (const cat of seed.categories) {
    const ref = db.collection('categories').doc();
    catMap[cat.name] = ref.id;
    catBatch.set(ref, { ...cat, storeId: 'main_store' });
  }
  await catBatch.commit();
  ok(`${seed.categories.length} categorías`);

  // 2. Subcategorías
  log('  Creando subcategorías...');
  const subcats = seed.subcategoriesData.map((s, i) => ({
    name: s.name,
    categoryId: catMap[s.parentCat] || '',
    parentSubcategoryId: '',
    order: i,
    ICON_URL: '',
    BACKGROUND_IMAGE_URL: '',
    ZOOM_BACKGROUND_IMAGE_URL: '',
    COLOR: '',
    description: '',
  }));
  const subBatch = db.batch();
  for (const sub of subcats) {
    const ref = db.collection('subcategories').doc();
    subBatch.set(ref, { ...sub, storeId: 'main_store' });
  }
  await subBatch.commit();
  ok(`${subcats.length} subcategorías`);

  // 3. Productos
  log('  Creando productos...');
  const catNameMap = {};
  for (const cat of seed.categories) catNameMap[cat.slug] = cat.name;
  const productsWithCat = seed.products.map((p) => {
    let catName = 'Skincare';
    if (p.TAGS?.includes('maquillaje')) catName = 'Maquillaje';
    else if (p.TAGS?.includes('cabello')) catName = 'Cabello';
    else if (p.TAGS?.includes('perfumes')) catName = 'Perfumes';
    else if (p.TAGS?.includes('accesorios')) catName = 'Accesorios';
    else if (p.TAGS?.includes('hogar')) catName = 'Hogar y Cocina';
    return { ...p, CATEGORYID: catMap[catName] || '', SUBCATEGORYID: '', IMAGEURL2: '', IMAGEURL3: '', FEATURES: [`SKU: ${p.sku}`, `Barcode: ${p.barcode}`], PACKQTY: 0 };
  });
  const prodBatch = db.batch();
  for (const p of productsWithCat) {
    const ref = db.collection('products').doc();
    prodBatch.set(ref, { ...p, storeId: 'main_store' });
  }
  await prodBatch.commit();
  ok(`${productsWithCat.length} productos`);

  // 4. Banners
  log('  Creando banners...');
  const banBatch = db.batch();
  for (const b of seed.banners) {
    const ref = db.collection('banners').doc();
    banBatch.set(ref, { ...b, storeId: 'main_store' });
  }
  await banBatch.commit();
  ok(`${seed.banners.length} banners`);

  // 5. Agencias
  log('  Creando agencias de envío...');
  const agBatch = db.batch();
  for (const a of seed.agencies) {
    const ref = db.collection('shipping_agencies').doc();
    agBatch.set(ref, { ...a, storeId: 'main_store' });
  }
  await agBatch.commit();
  ok(`${seed.agencies.length} agencias`);

  // 6. Store settings
  log('  Creando store_settings...');
  await db.collection('store_settings').add({
    STORENAME: storeName,
    PHONE: '+56 9 1234 5678',
    EMAIL: 'contacto@demo.cl',
    ADDRESS: 'Av. Demo 123, Santiago, Chile',
    WEBSITE: 'https://demo.cl',
    DESCRIPTION: `Tienda demo - ${storeName}`,
    SHOWINANNOUNCEMENTBAR: true,
    UNLIMITEDSTOCK: false,
    LOGO_URL: logoUrl || '',
    logoUrl: logoUrl || '',
    storeId: 'main_store',
  });
  ok('1 store_settings');

  // 7. Theme config
  log('  Creando theme_config...');
  const sections = [{
    id: 'hero', type: 'hero', title: 'Hero', enabled: true, order: -1, locked: true,
    settings: {
      heroStoreName: storeName,
      heroStoreLogoMode: logoUrl ? 'image' : 'text',
      heroStoreLogoUrl: logoUrl || '',
      heroStoreLogoScrollUrl: logoUrl || '',
      heroStoreLogoHeight: 40,
      heroAutoplay: false, heroDelay: 5000, heroTransitionSpeed: 1000,
      heroOverlayEnabled: true, heroOverlayOpacity: 0.3,
      heroSlides: [{ imageUrl: 'https://placehold.co/1920x800/1a1a2e/fff?text=' + encodeURIComponent(storeName), title: storeName, subtitle: 'E-COMMERCE', alignment: 'center' }],
    },
  }];
  await db.collection('theme_config').doc('homepage_sections').set({
    NAME: 'homepage_sections',
    SECTIONS: JSON.stringify(sections),
    storeId: 'main_store',
  }, { merge: true });
  ok('1 theme_config');

  // 8. Sequences
  log('  Creando sequences...');
  await db.collection('sequences').doc('order_sequence').set({ value: 0, storeId: 'main_store' });
  ok('1 sequences');

  // 9. Apertura settings
  log('  Creando apertura_settings...');
  await db.collection('apertura_settings').doc('apertura_config').set({
    isActive: false, title: 'Gran Apertura', subtitle: 'Descuentos de inauguración',
    discountPercentage: 20, startDate: '', endDate: '', storeId: 'main_store',
  });
  ok('1 apertura_settings');

  // 10. Colecciones auxiliares vacías
  log('  Creando colecciones auxiliares...');
  const emptyCols = [
    'orders', 'vendor_orders', 'vendors', 'users', 'reviews',
    'product_questions', 'favorites', 'cart_items', 'cart_snapshots',
    'notifications', 'stock_alerts', 'stock_requests', 'product_views',
    'product_votes', 'clips', 'live_streams', 'live_raffles',
    'raffle_participants', 'hotspot_panels', 'banner_overlay_positions',
    'house_product_positions', 'timed_offers', 'discount_coupons',
    'points_store_items', 'admin_chat', 'addresses', 'cotizaciones',
    'support_tickets', 'wholesale_orders', 'inventory_products',
    'catalog_products',
  ];
  const emptyBatch = db.batch();
  for (const col of emptyCols) {
    const ref = db.collection(col).doc('_init');
    emptyBatch.set(ref, { _seed: true, storeId: 'main_store', createdAt: Date.now() });
  }
  await emptyBatch.commit();
  ok(`${emptyCols.length} colecciones auxiliares`);

  return { categories: seed.categories.length, subcats: subcats.length, products: productsWithCat.length, banners: seed.banners.length, agencies: seed.agencies.length, empty: emptyCols.length };
}

// ═══════════════════════════════════════════════════════════════
// CREAR ADMIN USER
// ═══════════════════════════════════════════════════════════════
async function createAdminUser(app, databaseId, email, password) {
  const auth = getAuth(app);

  try {
    await auth.createUser({
      email, password, emailVerified: true, displayName: 'Admin',
    });
    ok(`Usuario admin creado: ${email}`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      const userRecord = await auth.getUserByEmail(email);
      await auth.updateUser(userRecord.uid, { password, emailVerified: true });
      ok(`Usuario admin actualizado: ${email}`);
    } else {
      throw e;
    }
  }

  // Crear doc en Firestore
  const db = getFirestore(app, databaseId);
  const userRecord = await auth.getUserByEmail(email);
  await db.collection('users').doc(userRecord.uid).set({
    email, name: 'Admin', role: 'admin', storeId: 'main_store',
  }, { merge: true });
  ok('Documento users creado en Firestore');
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  section('MIGRACIÓN YAXSELL — NUEVO CLIENTE FIREBASE');
  log('  Este script automatiza toda la migración a un nuevo proyecto Firebase.\n');

  // ─── Pedir datos ───
  log('  Necesito los siguientes datos:\n');

  const saPath = (await ask('  1. Ruta del Service Account JSON: ')).trim().replace(/\\/g, '/');
  if (!existsSync(saPath)) {
    err(`Archivo no encontrado: ${saPath}`);
    rl.close();
    process.exit(1);
  }

  const saJson = JSON.parse(readFileSync(saPath, 'utf-8'));
  const projectId = saJson.project_id;
  ok(`Project ID detectado: ${projectId}`);

  const databaseId = (await ask(`  2. Database ID de Firestore (default: yaxsell): `)).trim() || 'yaxsell';

  const apiKey = (await ask('  3. API Key (Web App): ')).trim();
  if (!apiKey) { err('API Key es requerida'); rl.close(); process.exit(1); }

  const messagingSenderId = (await ask('  4. Messaging Sender ID: ')).trim();
  const appId = (await ask('  5. App ID: ')).trim();

  const authDomain = `${projectId}.firebaseapp.com`;
  const storageBucket = `${projectId}.firebasestorage.app`;

  const tenantName = (await ask(`  6. Nombre del tenant para Storage (default: ${projectId}): `)).trim() || projectId;
  const storeName = (await ask('  7. Nombre de la tienda (default: Yaxsell Demo): ')).trim() || 'Yaxsell Demo';

  const adminEmail = (await ask('  8. Email del admin (default: admin@demo.cl): ')).trim() || 'admin@demo.cl';
  const adminPassword = (await ask('  9. Contraseña del admin (min 6 chars): ')).trim();
  if (!adminPassword || adminPassword.length < 6) {
    err('La contraseña debe tener al menos 6 caracteres');
    rl.close();
    process.exit(1);
  }

  const logoUrl = (await ask('  10. URL del logo (opcional, Enter para saltar): ')).trim() || '';

  rl.close();

  // ─── Resumen ───
  section('RESUMEN DE CONFIGURACIÓN');
  log(`  Project ID:          ${projectId}`);
  log(`  Database ID:         ${databaseId}`);
  log(`  Auth Domain:         ${authDomain}`);
  log(`  Storage Bucket:      ${storageBucket}`);
  log(`  Tenant:              ${tenantName}`);
  log(`  Store Name:          ${storeName}`);
  log(`  Admin Email:         ${adminEmail}`);
  log(`  Logo:                ${logoUrl || '(sin logo)'}`);
  log('');

  const confirm = await new Promise((r) => {
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    rl2.question('  ¿Confirmar migración? (s/n): ', (ans) => {
      rl2.close();
      r(ans.trim().toLowerCase());
    });
  });

  if (confirm !== 's' && confirm !== 'si' && confirm !== 'y' && confirm !== 'yes') {
    log('  Migración cancelada.');
    process.exit(0);
  }

  // ─── 1. Actualizar archivos de configuración ───
  section('1/7 — Actualizando configuración Firebase');

  updateFirebaseTs(projectId, apiKey, authDomain, storageBucket, messagingSenderId, appId, databaseId);
  updateDbServerTs(projectId, storageBucket, databaseId);
  updateDbTs(projectId, databaseId, tenantName);
  updateCollectionsTs(databaseId, tenantName);

  const config = {
    projectId, apiKey, authDomain, storageBucket, messagingSenderId, appId,
    saJsonString: JSON.stringify(saJson),
  };
  updateEnvLocal(config);

  // ─── 2. Actualizar admin access ───
  section('2/7 — Actualizando acceso admin');
  updateAdminAccess(adminEmail);

  // ─── 3. Actualizar logo ───
  section('3/7 — Actualizando logo');
  updateLayoutLogo(logoUrl);
  updateSectionConfig(storeName, logoUrl);

  // ─── 4. Actualizar metadata y branding ───
  section('4/7 — Actualizando branding');
  updateLoyaltyLevels();
  updateLayoutMetadata(storeName);
  updateSitemap();

  // ─── 5. Reemplazar URLs de Storage y referencias de marca ───
  section('5/7 — Reemplazando URLs y branding');
  const oldProjectIds = ['asistoraerp', 'geminai-449212'];
  replaceStorageUrls(oldProjectIds, storageBucket);
  replaceBrandReferences(storeName);

  // ─── 6. Seed Firestore ───
  section('6/7 — Poblando Firestore');
  log('  Conectando a Firebase...');

  const app = initializeApp({
    credential: cert(saJson),
    storageBucket: storageBucket,
  });

  try {
    const stats = await seedFirestore(app, databaseId, tenantName, storeName, logoUrl);
    log(`\n  Categorías: ${stats.categories} | Subcategorías: ${stats.subcats} | Productos: ${stats.products}`);
    log(`  Banners: ${stats.banners} | Agencias: ${stats.agencies} | Colecciones vacías: ${stats.empty}`);
  } catch (e) {
    err(`Error en seed: ${e.message}`);
    log('  ¿Firestore está creado en Firebase Console?');
    log('  Ve a Firebase Console → Firestore → Create database');
    process.exit(1);
  }

  // ─── 7. Crear admin user ───
  section('7/7 — Creando usuario admin');
  try {
    await createAdminUser(app, databaseId, adminEmail, adminPassword);
  } catch (e) {
    err(`Error creando admin: ${e.message}`);
    log('  ¿Está habilitado Email/Password en Firebase Console → Authentication?');
  }

  // ─── Final ───
  section('MIGRACIÓN COMPLETADA');
  log(`  Proyecto:    ${projectId}`);
  log(`  Database:    ${databaseId}`);
  log(`  Tenant:      ${tenantName}`);
  log(`  Admin:       ${adminEmail}`);
  log('');
  log('  PRÓXIMOS PASOS:');
  log('  1. Borrar caché:  rm -rf .next');
  log('  2. Iniciar server: npm run dev');
  log('  3. Abrir:          http://localhost:3000/admin/login');
  log(`  4. Login:          ${adminEmail} / ${adminPassword}`);
  log('');
  log('  ✓ Migración completada exitosamente.\n');

  process.exit(0);
}

main().catch((e) => {
  err(`Error fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});
