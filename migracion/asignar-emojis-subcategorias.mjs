#!/usr/bin/env node
/**
 * asignar-emojis-subcategorias.mjs
 *
 * Asigna un emoji a cada subcategoría de supermercado.
 * No genera imágenes, solo asigna emojis (gratis).
 */
import { readFileSync, existsSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Mapa de emoji por nombre de subcategoría
const EMOJI_MAP = {
  // Alimentos y Despensa
  'Arroz y Legumbres': '🍚',
  'Pastas y Fideos': '🍝',
  'Harinas y Cereales': '🌾',
  'Aceites y Vinagres': '🫗',
  'Salsas y Aderezos': '🥫',
  'Conservas y Enlatados': '🥫',
  'Caldos y Sopas': '🍲',
  // Bebidas
  'Jugos y Néctares': '🧃',
  'Bebidas Gasificadas': '🥤',
  'Aguas': '💧',
  'Té y Café': '☕',
  'Bebidas Deportivas': '🏃',
  'Energéticas': '⚡',
  // Lácteos y Huevos
  'Leche': '🥛',
  'Yogures': '🥣',
  'Quesos': '🧀',
  'Mantequilla y Margarina': '🧈',
  'Crema y Postres': '🍮',
  'Huevos': '🥚',
  // Carnes y Pescados
  'Carne de Res': '🥩',
  'Carne de Cerdo': '🥓',
  'Pollo y Ave': '🍗',
  'Pescados': '🐟',
  'Mariscos': '🦐',
  'Embutidos y Fiambres': '🌭',
  // Frutas y Verduras
  'Frutas Frescas': '🍎',
  'Verduras Frescas': '🥬',
  'Frutas Congeladas': '🫐',
  'Verduras Congeladas': '🥦',
  'Frutos Secos': '🥜',
  'Hierbas y Especias': '🌿',
  // Panadería y Repostería
  'Pan Fresco': '🍞',
  'Pan Pack': '🍞',
  'Galletas': '🍪',
  'Pasteles y Tortas': '🎂',
  'Repostería': '🧁',
  'Desayuno': '🥐',
  // Snacks y Dulces
  'Chocolates': '🍫',
  'Caramelos': '🍬',
  'Papas y Snacks': '🍟',
  'Helados': '🍦',
  'Mermeladas y Mieles': '🍯',
  // Limpieza del Hogar
  'Detergentes': '🧺',
  'Suavizantes': '🌸',
  'Lavavajillas': '🧽',
  'Desinfectantes': '🧴',
  'Limpia Pisos': '🧹',
  'Limpia Baños': '🚽',
  'Limpia Cocina': '🍳',
  'Bolsas y Otros': '🗑️',
  // Cuidado Personal
  'Shampoo y Acondicionador': '🧴',
  'Jabón y Desodorante': '🧼',
  'Cuidado Dental': '🪥',
  'Cuidado Facial': '🧖',
  'Cuidado Corporal': '🧴',
  'Perfumes': '🌸',
  'Afeitado': '🪒',
  // Bebé y Niños
  'Pañales': '👶',
  'Alimentación Infantil': '🍼',
  'Higiene del Bebé': '🧴',
  'Biberones y Accesorios': '🍼',
  // Mascotas
  'Alimento para Perros': '🐶',
  'Alimento para Gatos': '🐱',
  'Alimento para Aves': '🐦',
  'Higiene y Accesorios': '🐾',
  // Congelados
  'Comidas Congeladas': '🥟',
  'Helados': '🍦',
  'Verduras Congeladas': '🥦',
  'Mariscos Congelados': '🦐',
  'Carne Congelada': '🥩',
  // Otros
  'Bazar y Cocina': '🍳',
  'Papelería': '📝',
  'Ferretería': '🔧',
  'Otros': '📦',
};

async function main() {
  console.log('\n═══ ASIGNAR EMOJIS A SUBCATEGORÍAS ═══\n');

  const saPath = 'scripts/yaxselldemo-key.json';
  if (!existsSync(saPath)) {
    console.error('  No se encontró scripts/yaxselldemo-key.json');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  const app = initializeApp({ credential: cert(sa) });
  const db = getFirestore(app, '(default)');

  const snap = await db.collection('subcategories').get();
  console.log(`  Total subcategorías: ${snap.size}\n`);

  let updated = 0;
  let noEmoji = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name;
    const emoji = EMOJI_MAP[name];

    if (emoji) {
      await doc.ref.update({ icon: emoji });
      console.log(`  ✓ ${emoji}  ${name}`);
      updated++;
    } else {
      console.log(`  ⚠ sin emoji: ${name}`);
      noEmoji++;
    }
  }

  console.log(`\n  ✓ ${updated} actualizadas, ${noEmoji} sin emoji asignado.\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
