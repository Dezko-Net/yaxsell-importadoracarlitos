#!/usr/bin/env node
/**
 * crear-admin.mjs
 * 
 * Script independiente para crear/actualizar el usuario admin en Firebase Auth.
 * 
 * Uso:
 *   node migracion/crear-admin.mjs
 */
import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const ok = (s) => console.log(`  \u2713 ${s}`);
const err = (s) => console.error(`  \u2717 ${s}`);

async function main() {
  console.log('\n\u2550\u2550\u2550 CREAR USUARIO ADMIN \u2550\u2550\u2550\n');

  const saPath = (await ask('  Ruta del Service Account JSON: ')).trim().replace(/\\/g, '/');
  const databaseId = (await ask('  Database ID (default: yaxsell): ')).trim() || 'yaxsell';
  const email = (await ask('  Email del admin: ')).trim();
  const password = (await ask('  Contraseña (min 6 chars): ')).trim();
  const name = (await ask('  Nombre (default: Admin): ')).trim() || 'Admin';

  rl.close();

  if (!email || !password || password.length < 6) {
    err('Email y contraseña válidos son requeridos');
    process.exit(1);
  }

  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  const app = initializeApp({
    credential: cert(sa),
    storageBucket: `${sa.project_id}.firebasestorage.app`,
  });

  const auth = getAuth(app);

  try {
    await auth.createUser({ email, password, emailVerified: true, displayName: name });
    ok(`Usuario creado: ${email}`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      const userRecord = await auth.getUserByEmail(email);
      await auth.updateUser(userRecord.uid, { password, emailVerified: true, displayName: name });
      ok(`Usuario actualizado: ${email}`);
    } else {
      throw e;
    }
  }

  // Crear doc en Firestore
  const db = getFirestore(app, databaseId);
  const userRecord = await auth.getUserByEmail(email);
  await db.collection('users').doc(userRecord.uid).set({
    email, name, role: 'admin', storeId: 'main_store',
  }, { merge: true });
  ok('Documento users creado en Firestore');

  // Actualizar admin-access.ts
  const { writeFileSync } = await import('fs');
  const { join, dirname, resolve } = await import('path');
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const PROJECT_ROOT = resolve(__dirname, '..');

  const adminAccessPath = join(PROJECT_ROOT, 'src/lib/admin-access.ts');
  writeFileSync(adminAccessPath,
    `/** Correo con acceso al panel /admin y a /inventario */
export const ADMIN_EMAIL = '${email}';

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
`);
  ok('src/lib/admin-access.ts actualizado');

  console.log('\n  \u2713 Admin creado exitosamente.\n');
  console.log(`  Email: ${email}`);
  console.log(`  Login: http://localhost:3000/admin/login\n`);
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
