# Guía de Migración — Nuevo Cliente Firebase

Esta carpeta contiene todo lo necesario para crear un demo nuevo del motor YAXSELL
apuntando a un proyecto Firebase distinto. El proceso está **100% automatizado**.

---

## Qué hace el script de migración

1. **Actualiza la configuración Firebase** en 4 archivos clave:
   - `src/lib/firebase.ts` (client SDK)
   - `src/lib/db-server.ts` (admin SDK)
   - `src/lib/db.ts` (constantes + MEDIA_PREFIXES)
   - `src/lib/collections.ts` (constantes + MEDIA_PREFIXES)

2. **Actualiza `.env.local`** con:
   - API key, auth domain, project ID, storage bucket, messaging sender ID, app ID
   - Service Account JSON completo (para Admin SDK)

3. **Reemplaza referencias hardcodeadas** al proyecto anterior:
   - URLs de Storage (`asistoraerp.firebasestorage.app`, `geminai-449212.firebasestorage.app`)
   - MEDIA_PREFIXES (`don-balato-ivan/` → nuevo tenant)
   - Nombres de marca (`Importadora Carlitos`, `donbalatoivan.cl`)

4. **Crea las colecciones en Firestore** con datos seed:
   - 6 categorías, 15 subcategorías, 15 productos demo
   - 3 banners, 14 agencias de envío
   - store_settings, theme_config, sequences, apertura_settings
   - 31 colecciones auxiliares (orders, users, vendors, etc.)

5. **Crea el usuario admin** en Firebase Auth

6. **Configura el logo** en theme_config y store_settings

---

## Requisitos previos

Antes de ejecutar el script, necesitas tener listo en Firebase Console:

### 1. Crear proyecto Firebase
- https://console.firebase.google.com → Add project
- Nombre: el que quieras (ej: `yaxsell-cliente2`)
- Habilitar Google Analytics (opcional)

### 2. Crear Firestore Database
- Firebase Console → Firestore Database → Create database
- Región: `southamerica-east1` (Santiago) o `nam5` (US)
- Modo: Production o Test (temporal)
- **Anota el nombre de la base de datos** (si la llamas distinto a `(default)`)

### 3. Crear Storage bucket
- Firebase Console → Storage → Get started
- El bucket se crea automáticamente como `<projectId>.firebasestorage.app`

### 4. Crear Web App (para API key)
- Firebase Console → Project Settings (⚙️) → Add app → Web `</>`
- Nickname: `web-app`
- Copiar: `apiKey`, `messagingSenderId`, `appId`

### 5. Descargar Service Account JSON
- Firebase Console → Project Settings → Service Accounts → Generate new private key
- Guardar el archivo JSON en una carpeta conocida

### 6. Habilitar Email/Password Auth
- Firebase Console → Authentication → Sign-in method → Email/Password → Enable

---

## Cómo ejecutar la migración

```bash
node migracion/migrar-cliente.mjs
```

El script te pedirá interactivamente:

1. **Ruta del Service Account JSON** (ej: `C:/Users/Yanpo/Downloads/cliente2-firebase-adminsdk.json`)
2. **Project ID** (ej: `yaxsell-cliente2`) — se extrae automáticamente del JSON
3. **Database ID de Firestore** (ej: `yaxsell` o `(default)`)
4. **API Key** (de la Web App)
5. **Messaging Sender ID** (de la Web App)
6. **App ID** (de la Web App)
7. **Nombre del tenant** para MEDIA_PREFIXES (ej: `cliente2`)
8. **Nombre de la tienda** (ej: `Mi Tienda Demo`)
9. **Email del admin** (ej: `admin@mitienda.cl`)
10. **Contraseña del admin**
11. **URL del logo** (opcional)

Y el script hace todo automáticamente:
- Actualiza los 4 archivos de configuración
- Actualiza `.env.local`
- Reemplaza 287+ referencias hardcodeadas
- Crea 41 colecciones en Firestore con datos seed
- Crea el usuario admin en Firebase Auth
- Configura el logo
- Verifica el build

---

## Después de la migración

1. **Reiniciar el dev server**:
   ```bash
   # Borrar caché y reiniciar
   rm -rf .next
   npm run dev
   ```

2. **Verificar que todo funciona**:
   - Home: http://localhost:3000
   - Admin: http://localhost:3000/admin/login
   - Login con el email/contraseña configurados

3. **Desplegar a Vercel**:
   - Subir el repo a GitHub
   - Conectar con Vercel
   - Copiar las variables de `.env.local` a Vercel Environment Variables

---

## Archivos que modifica el script

| Archivo | Qué cambia |
|---|---|
| `src/lib/firebase.ts` | projectId, storageBucket, authDomain, apiKey, appId, databaseId |
| `src/lib/db-server.ts` | projectId, storageBucket, databaseId en Admin SDK |
| `src/lib/db.ts` | DATABASE_ID, MEDIA_PREFIXES, getFirebaseConfig |
| `src/lib/collections.ts` | DATABASE_ID, MEDIA_PREFIXES |
| `.env.local` | Todas las variables NEXT_PUBLIC_FIREBASE_* + GOOGLE_APPLICATION_CREDENTIALS_JSON |
| `src/app/admin/(panel)/layout.tsx` | Logo URL del admin top bar |
| `src/app/vendor/layout.tsx` | Logo URL del vendor |
| `src/lib/admin-access.ts` | Email del admin |
| `src/lib/loyalty-levels.ts` | Niveles de lealtad (nombres de tiers) |
| `src/lib/section-config.ts` | heroStoreName |
| `src/app/layout.tsx` | Metadata, título del sitio |
| `src/app/sitemap.ts` | Dominio del sitemap |
| 67 archivos en total | Reemplazo de URLs de Storage, nombres de marca, links |

---

## Script de seed (independiente)

Si solo necesitas repoblar Firestore con datos demo (sin cambiar configuración):

```bash
node migracion/seed-firestore.mjs
```

Te pedirá la ruta del Service Account JSON y el Database ID.

---

## Script de crear admin (independiente)

Si solo necesitas crear/actualizar el usuario admin:

```bash
node migracion/crear-admin.mjs
```

---

## Troubleshooting

### Error: "5 NOT_FOUND" al hacer seed
Firestore no está creado. Ve a Firebase Console → Firestore → Create database.

### Error: "auth/email-already-exists"
El usuario ya existe. El script actualiza la contraseña automáticamente.

### El logo no aparece
- Verificar que la URL del logo sea pública
- Borrar `.next` y reiniciar: `rm -rf .next && npm run dev`

### Las imágenes de productos no cargan
Los productos seed usan `placehold.co` como imágenes. Para usar imágenes reales,
sube los productos desde el admin panel o modifica el script de seed.

### Firebase Auth no funciona
- Verificar que Email/Password esté habilitado en Firebase Console
- Verificar que el dominio `localhost` esté en Authorized domains (Authentication → Settings)

---

*Última actualización: 2026-08-28*
*Proyecto base: YAXSELL DEMO (FIREBASE)*
